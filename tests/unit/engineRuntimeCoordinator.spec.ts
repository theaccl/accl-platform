import { expect, test } from '@playwright/test';

import type { EngineAnalysisResult, EngineTransport } from '@/lib/chess';
import { ENGINE_RUNTIME_REQUEST_SCHEMA } from '@/lib/chess/runtime';
import { EngineRuntimeCoordinator } from '@/services/stockfish-engine/src/coordinator';
import {
  EngineWorkerPool,
  type PhysicalEngineWorker,
} from '@/services/stockfish-engine/src/pool';

class CoordinatorWorker implements PhysicalEngineWorker {
  recoverCalls = 0;
  terminateCalls = 0;
  prepareLeaseImpl?: () => Promise<EngineTransport>;
  private leaseError?: (error: unknown) => void;

  constructor(readonly id: string) {}
  async warm() {}
  async prepareLease() {
    if (this.prepareLeaseImpl) return this.prepareLeaseImpl();
    return {
      send() {},
      subscribe: (handlers: { onLine: (line: string) => void; onError?: (error: unknown) => void }) => {
        this.leaseError = handlers.onError;
        return () => {
          this.leaseError = undefined;
        };
      },
      close() {},
    };
  }
  async resetAfterLease() {}
  async recoverAfterInterrupt() {
    this.recoverCalls += 1;
    return true;
  }
  residentMemoryBytes() {
    return 1;
  }
  async terminate() {
    this.terminateCalls += 1;
    this.leaseError?.(new Error('worker_terminated'));
  }
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function request(correlationId: string, engineFen = START_FEN) {
  return {
    schemaVersion: ENGINE_RUNTIME_REQUEST_SCHEMA,
    correlationId,
    engineFen,
    lane: 'TRAINER_INTERACTIVE' as const,
    limits: { depth: 8, multiPv: 1, timeoutMs: 9_000 },
    remainingBudgetMs: 12_000,
  };
}

async function createPool() {
  const workers: CoordinatorWorker[] = [];
  const pool = new EngineWorkerPool(async () => {
    const worker = new CoordinatorWorker(`worker-${workers.length + 1}`);
    workers.push(worker);
    return worker;
  });
  await pool.start();
  return { pool, workers };
}

test('coordinator reparses FEN service-side and returns the authoritative result', async () => {
  const { pool } = await createPool();
  let seenPositionKey = '';
  const coordinator = new EngineRuntimeCoordinator(pool, async ({ request: approved, position }) => {
    seenPositionKey = position.positionKey;
    const result: EngineAnalysisResult = {
      identity: { name: 'stockfish', version: 'test-full' },
      positionKey: position.positionKey,
      engineFen: position.engineFen,
      turn: position.turn,
      pov: 'white',
      terminal: position.terminal,
      bestMove: 'e2e4',
      lines: [],
      limits: approved.limits,
    };
    return result;
  });

  const envelope = await coordinator.evaluate(request('success'));
  expect(envelope).toMatchObject({ ok: true, result: { positionKey: seenPositionKey } });
  expect(seenPositionKey).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
  await coordinator.shutdown();
});

test('invalid position fails before admission or worker acquisition', async () => {
  const { pool } = await createPool();
  let executed = false;
  const coordinator = new EngineRuntimeCoordinator(pool, async () => {
    executed = true;
    throw new Error('must_not_execute');
  });

  await expect(coordinator.evaluate(request('invalid', 'not-a-fen'))).resolves.toEqual({
    ok: false,
    error: { code: 'INVALID_POSITION', retryable: false },
  });
  expect(executed).toBe(false);
  await coordinator.shutdown();
});

test('running caller cancellation settles once and recovers the leased worker', async () => {
  const { pool, workers } = await createPool();
  const controller = new AbortController();
  const coordinator = new EngineRuntimeCoordinator(
    pool,
    async () => await new Promise<EngineAnalysisResult>(() => {})
  );

  const evaluation = coordinator.evaluate(request('cancel'), controller.signal);
  await expect.poll(() => coordinator.snapshot().runningRequests).toBe(1);
  controller.abort();

  await expect(evaluation).resolves.toEqual({
    ok: false,
    error: { code: 'ENGINE_REQUEST_CANCELLED', retryable: false },
  });
  expect(workers[0]?.recoverCalls).toBe(1);
  expect(coordinator.snapshot().runningRequests).toBe(0);
  await coordinator.shutdown();
});

function successResult(
  position: { positionKey: string; engineFen: string; turn: 'w' | 'b'; terminal: boolean },
  limits: EngineAnalysisResult['limits']
): EngineAnalysisResult {
  return {
    identity: { name: 'stockfish', version: 'test-full' },
    positionKey: position.positionKey,
    engineFen: position.engineFen,
    turn: position.turn,
    pov: 'white',
    terminal: position.terminal,
    bestMove: position.terminal ? null : 'e2e4',
    lines: position.terminal
      ? []
      : [
          {
            rank: 1,
            move: 'e2e4',
            pv: ['e2e4'],
            score: { kind: 'cp', cp: 10 },
            depth: 8,
            bound: null,
          },
        ],
    limits,
  };
}

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

test('healthy recycle while the peer is leased does not fail a queued request', async () => {
  // Current finish() awaits settle/recycle before dispatch.release(), so
  // scheduler.running stays at 2 and acquire()===null is not reached.
  // If this test fails after finish() changes, do not alter that branch
  // without a new approval — release must remain after settle.
  const workers: CoordinatorWorker[] = [];
  const replacementWarm = gate();
  const pool = new EngineWorkerPool(
    async () => {
      const worker = new CoordinatorWorker(`worker-${workers.length + 1}`);
      workers.push(worker);
      if (workers.length === 3) {
        worker.warm = async () => await replacementWarm.promise;
      }
      return worker;
    },
    { maxCompletedSearches: 1, sleep: async () => {} }
  );
  await pool.start();

  const holds = new Map<string, ReturnType<typeof gate>>();
  const coordinator = new EngineRuntimeCoordinator(pool, async ({ request: approved, position }) => {
    const blocked = holds.get(approved.correlationId);
    if (blocked) await blocked.promise;
    return successResult(position, approved.limits);
  });

  holds.set('hold-a', gate());
  holds.set('hold-b', gate());
  const holdA = coordinator.evaluate(request('hold-a'));
  const holdB = coordinator.evaluate(request('hold-b'));
  await expect.poll(() => coordinator.snapshot().scheduler.running).toBe(2);

  let queuedSettled = false;
  const queued = coordinator.evaluate(request('queued')).then((envelope) => {
    queuedSettled = true;
    return envelope;
  });
  await expect.poll(() => coordinator.snapshot().scheduler.waiting).toBe(1);

  holds.get('hold-a')?.resolve();
  await expect.poll(() => workers.length).toBe(3);

  expect(queuedSettled).toBe(false);
  expect(coordinator.snapshot().scheduler).toMatchObject({ running: 2, waiting: 1 });

  replacementWarm.resolve();
  holds.get('hold-b')?.resolve();
  await expect(holdA).resolves.toMatchObject({ ok: true });
  await expect(holdB).resolves.toMatchObject({ ok: true });
  await expect(queued).resolves.toMatchObject({ ok: true });
  expect(queuedSettled).toBe(true);
  await coordinator.shutdown();
});

test('recycle replacement failure settles the caller immediately then reuses the worker after the circuit', async () => {
  const workers: CoordinatorWorker[] = [];
  let now = 10_000;
  const sleepWaits: Array<() => void> = [];
  const pool = new EngineWorkerPool(
    async () => {
      if (workers.length >= 2) throw new Error('injected_recycle_failure');
      const worker = new CoordinatorWorker(`worker-${workers.length + 1}`);
      workers.push(worker);
      return worker;
    },
    {
      maxCompletedSearches: 1,
      now: () => now,
      sleep: async () =>
        await new Promise<void>((resolve) => {
          sleepWaits.push(resolve);
        }),
    }
  );
  await pool.start();

  const coordinator = new EngineRuntimeCoordinator(pool, async ({ request: approved, position }) =>
    successResult(position, approved.limits)
  );

  const first = coordinator.evaluate(request('recycle-fail'));
  await expect(first).resolves.toMatchObject({ ok: true });
  await expect.poll(() => sleepWaits.length).toBeGreaterThan(0);
  expect(coordinator.snapshot().scheduler.running).toBe(1);

  for (let attempt = 0; attempt < 20 && coordinator.snapshot().scheduler.running > 0; attempt += 1) {
    const pending = sleepWaits.splice(0, sleepWaits.length);
    for (const release of pending) release();
    await Promise.resolve();
  }

  await expect.poll(() => coordinator.snapshot().scheduler.running).toBe(0);
  expect(pool.snapshot().circuitOpenUntilMs).not.toBeNull();
  await expect(coordinator.evaluate(request('during-circuit'))).resolves.toEqual({
    ok: false,
    error: { code: 'ENGINE_POOL_UNAVAILABLE', retryable: true },
  });

  now += 30_001;
  await expect(coordinator.evaluate(request('after-circuit'))).resolves.toMatchObject({ ok: true });
  await coordinator.shutdown();
});

test('shutdown classifies running work as pool unavailable, never caller cancellation', async () => {
  const { pool } = await createPool();
  const coordinator = new EngineRuntimeCoordinator(
    pool,
    async () => await new Promise<EngineAnalysisResult>(() => {})
  );
  const evaluation = coordinator.evaluate(request('shutdown'));
  await expect.poll(() => coordinator.snapshot().runningRequests).toBe(1);

  await coordinator.shutdown();
  await expect(evaluation).resolves.toEqual({
    ok: false,
    error: { code: 'ENGINE_POOL_UNAVAILABLE', retryable: true },
  });
});

const poolUnavailable = {
  ok: false as const,
  error: { code: 'ENGINE_POOL_UNAVAILABLE' as const, retryable: true },
};

test('shutdown classifies a lease error from worker termination as pool unavailable', async () => {
  const { pool } = await createPool();
  const coordinator = new EngineRuntimeCoordinator(pool, async ({ transport }) => {
    return await new Promise<EngineAnalysisResult>((_, reject) => {
      transport.subscribe({
        onLine() {},
        onError: reject,
      });
    });
  });
  const evaluation = coordinator.evaluate(request('term-error'));
  await expect.poll(() => coordinator.snapshot().runningRequests).toBe(1);
  await coordinator.shutdown();
  await expect(evaluation).resolves.toEqual(poolUnavailable);
});

test('shutdown classifies a late acquire failure as pool unavailable', async () => {
  const workers: CoordinatorWorker[] = [];
  const prepare = gate();
  const pool = new EngineWorkerPool(async () => {
    const worker = new CoordinatorWorker(`worker-${workers.length + 1}`);
    if (workers.length === 1) {
      worker.prepareLeaseImpl = async () => {
        await prepare.promise;
        throw new Error('prepare_failed_after_shutdown');
      };
    }
    workers.push(worker);
    return worker;
  });
  await pool.start();

  const coordinator = new EngineRuntimeCoordinator(
    pool,
    async () => await new Promise<EngineAnalysisResult>(() => {})
  );
  const first = coordinator.evaluate(request('hold'));
  await expect.poll(() => coordinator.snapshot().runningRequests).toBe(1);
  const second = coordinator.evaluate(request('late-acquire'));
  await expect.poll(() => coordinator.snapshot().scheduler.running).toBe(2);

  const shutting = coordinator.shutdown();
  await expect.poll(() => coordinator.snapshot().shuttingDown).toBe(true);
  prepare.resolve();
  await expect(second).resolves.toEqual(poolUnavailable);
  await expect(first).resolves.toEqual(poolUnavailable);
  await shutting;
});
