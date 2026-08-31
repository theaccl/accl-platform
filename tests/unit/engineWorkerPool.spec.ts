import { expect, test } from '@playwright/test';

import type { EngineTransport } from '@/lib/chess';
import { createLeaseTransport, type PhysicalWorkerIo } from '@/services/stockfish-engine/src/leaseTransport';
import {
  CIRCUIT_OPEN_MS,
  EngineWorkerPool,
  type PhysicalEngineWorker,
} from '@/services/stockfish-engine/src/pool';
import { isEngineRuntimeReady } from '@/services/stockfish-engine/src/server';

function inertTransport(): EngineTransport {
  return {
    send() {},
    subscribe() {
      return () => {};
    },
    close() {},
  };
}

class FakeWorker implements PhysicalEngineWorker {
  warmCalls = 0;
  prepareCalls = 0;
  resetCalls = 0;
  recoverCalls = 0;
  terminateCalls = 0;
  recoverResult = true;
  warmError: Error | null = null;
  terminateError: Error | null = null;
  rss: number | null = 1;

  constructor(
    readonly id: string,
    private readonly events: string[] = []
  ) {}

  async warm() {
    this.warmCalls += 1;
    this.events.push(`${this.id}:warm`);
    if (this.warmError) throw this.warmError;
  }

  async prepareLease() {
    this.prepareCalls += 1;
    return inertTransport();
  }

  async resetAfterLease() {
    this.resetCalls += 1;
    this.events.push(`${this.id}:reset`);
  }

  async recoverAfterInterrupt() {
    this.recoverCalls += 1;
    return this.recoverResult;
  }

  residentMemoryBytes() {
    return this.rss;
  }

  async terminate() {
    this.terminateCalls += 1;
    this.events.push(`${this.id}:terminate`);
    if (this.terminateError) throw this.terminateError;
  }
}

test('lease transport detaches once and ignores late lines without releasing a worker', () => {
  let handlers: Parameters<PhysicalWorkerIo['subscribe']>[0] | null = null;
  let detachCalls = 0;
  const commands: string[] = [];
  const lines: string[] = [];
  const transport = createLeaseTransport({
    send(command) {
      commands.push(command);
    },
    subscribe(next) {
      handlers = next;
      return () => {
        detachCalls += 1;
      };
    },
  });

  transport.subscribe({ onLine: (line) => lines.push(line) });
  transport.send('uci');
  const activeHandlers = handlers as unknown as { onLine: (line: string) => void };
  activeHandlers.onLine('uciok');
  transport.close();
  transport.close();
  activeHandlers.onLine('late');

  expect(commands).toEqual(['uci']);
  expect(lines).toEqual(['uciok']);
  expect(detachCalls).toBe(1);
  expect(() => transport.send('isready')).toThrow('engine_lease_closed');
});

test('pool holds two warm workers and settles a lease exactly once', async () => {
  const workers: FakeWorker[] = [];
  const pool = new EngineWorkerPool(async () => {
    const worker = new FakeWorker(`worker-${workers.length + 1}`);
    workers.push(worker);
    return worker;
  });
  await pool.start();

  const first = await pool.acquire();
  const second = await pool.acquire();
  expect(first?.workerId).toBe('worker-1');
  expect(second?.workerId).toBe('worker-2');
  expect(await pool.acquire()).toBeNull();

  expect(await first?.settle('success')).toBe(true);
  expect(await first?.settle('success')).toBe(false);
  expect(workers[0]?.resetCalls).toBe(1);
  expect(pool.snapshot().workers.map((worker) => worker.state)).toEqual(['IDLE', 'LEASED']);

  await second?.settle('caller_cancelled');
  expect(workers[1]?.recoverCalls).toBe(1);
  expect(pool.snapshot().workers.map((worker) => worker.state)).toEqual(['IDLE', 'IDLE']);
});

test('crash isolation replaces only the failed worker', async () => {
  const workers: FakeWorker[] = [];
  const pool = new EngineWorkerPool(async () => {
    const worker = new FakeWorker(`worker-${workers.length + 1}`);
    workers.push(worker);
    return worker;
  }, { sleep: async () => {} });
  await pool.start();
  const lease = await pool.acquire();
  await lease?.settle('engine_crashed');

  expect(workers).toHaveLength(3);
  expect(workers[0]?.terminateCalls).toBe(1);
  expect(workers[1]?.terminateCalls).toBe(0);
  expect(pool.snapshot().workers.map((worker) => worker.id).sort()).toEqual(['worker-2', 'worker-3']);
});

test('healthy recycling warms replacement before retiring the old worker', async () => {
  const events: string[] = [];
  const workers: FakeWorker[] = [];
  const pool = new EngineWorkerPool(
    async () => {
      const worker = new FakeWorker(`worker-${workers.length + 1}`, events);
      workers.push(worker);
      return worker;
    },
    { maxCompletedSearches: 1, sleep: async () => {} }
  );
  await pool.start();
  events.length = 0;
  const lease = await pool.acquire();
  await lease?.settle('success');

  expect(events).toEqual(['worker-1:reset', 'worker-3:warm', 'worker-1:terminate']);
  expect(pool.snapshot().workers).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'worker-2' }),
      expect.objectContaining({ id: 'worker-3', state: 'IDLE' }),
    ])
  );
  expect(pool.snapshot().workers.some((worker) => worker.id === 'worker-1')).toBe(false);
});

test('five replacement failures open the pool circuit', async () => {
  let creations = 0;
  let now = 10_000;
  const pool = new EngineWorkerPool(
    async () => {
      creations += 1;
      if (creations > 2) throw new Error('injected_warm_failure');
      return new FakeWorker(`worker-${creations}`);
    },
    {
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
    }
  );
  await pool.start();
  const lease = await pool.acquire();
  await lease?.settle('engine_crashed');

  expect(creations).toBe(7);
  expect(pool.snapshot().circuitOpenUntilMs).toBeGreaterThan(now);
  expect(await pool.acquire()).toBeNull();
});

test('closed circuit replenishes missing capacity once before concurrent leases', async () => {
  let creations = 0;
  let now = 10_000;
  let releaseRecoveredWarm!: () => void;
  const recoveredWarm = new Promise<void>((resolve) => {
    releaseRecoveredWarm = resolve;
  });
  const pool = new EngineWorkerPool(
    async () => {
      creations += 1;
      const worker = new FakeWorker(`worker-${creations}`);
      if (creations >= 3 && creations <= 7) {
        worker.warmError = new Error('injected_replacement_failure');
      }
      if (creations === 8) {
        worker.warm = async () => {
          worker.warmCalls += 1;
          await recoveredWarm;
        };
      }
      return worker;
    },
    {
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
    }
  );
  await pool.start();
  const failedLease = await pool.acquire();
  await failedLease?.settle('engine_crashed');
  expect(creations).toBe(7);
  expect(pool.snapshot().workers).toHaveLength(1);

  now += CIRCUIT_OPEN_MS + 1;
  const firstAcquire = pool.acquire();
  const secondAcquire = pool.acquire();
  await expect.poll(() => creations).toBe(8);
  expect(pool.snapshot().workers.filter((worker) => worker.state === 'WARMING')).toHaveLength(1);

  releaseRecoveredWarm();
  const [first, second] = await Promise.all([firstAcquire, secondAcquire]);
  expect(new Set([first?.workerId, second?.workerId])).toEqual(
    new Set(['worker-2', 'worker-8'])
  );
  expect(creations).toBe(8);
  expect(pool.snapshot().workers).toHaveLength(2);
  await first?.settle('success');
  await second?.settle('success');
  expect(pool.snapshot().workers.map((worker) => worker.state)).toEqual(['IDLE', 'IDLE']);
});

test('second startup worker that fails warm and terminate stays retiring and blocks start', async () => {
  const workers: FakeWorker[] = [];
  const pool = new EngineWorkerPool(async () => {
    const worker = new FakeWorker(`worker-${workers.length + 1}`);
    if (workers.length === 1) {
      worker.warmError = new Error('injected_warm_failure');
      worker.terminateError = new Error('injected_terminate_failure');
    }
    workers.push(worker);
    return worker;
  });

  await expect(pool.start()).rejects.toThrow('engine_warm_cleanup_failed');
  expect(workers).toHaveLength(2);
  expect(pool.snapshot()).toMatchObject({
    accepting: false,
    workers: [{ id: 'worker-2', state: 'RETIRING' }],
  });
  await expect(pool.start()).rejects.toThrow('engine_pool_already_started');
  expect(workers).toHaveLength(2);
});

test('replacement warm and terminate failure stops retries and is not leasable', async () => {
  const workers: FakeWorker[] = [];
  let now = 10_000;
  const pool = new EngineWorkerPool(
    async () => {
      const worker = new FakeWorker(`worker-${workers.length + 1}`);
      if (workers.length >= 2) {
        worker.warmError = new Error('injected_warm_failure');
        worker.terminateError = new Error('injected_terminate_failure');
      }
      workers.push(worker);
      return worker;
    },
    {
      maxCompletedSearches: 1,
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
    }
  );
  await pool.start();
  const lease = await pool.acquire();
  await lease?.settle('engine_crashed');

  expect(workers).toHaveLength(3);
  expect(pool.snapshot().circuitOpenUntilMs).toBeGreaterThan(now);
  expect(pool.snapshot().workers).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: 'worker-3', state: 'RETIRING' })])
  );
  expect(pool.snapshot().workers.every((worker) => worker.state !== 'IDLE' || worker.id !== 'worker-3')).toBe(
    true
  );
  expect(await pool.acquire()).toBeNull();
  expect(
    isEngineRuntimeReady({ shuttingDown: false, pool: pool.snapshot() })
  ).toBe(false);

  now += 30_001;
  const surviving = await pool.acquire();
  expect(surviving?.workerId).toBe('worker-2');
  expect(await surviving?.settle('success')).toBe(true);
  expect(workers).toHaveLength(3);
  expect(pool.snapshot().workers).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'worker-2', state: 'IDLE' }),
      expect.objectContaining({ id: 'worker-3', state: 'RETIRING' }),
    ])
  );
  expect(pool.snapshot().circuitOpenUntilMs).toBeGreaterThan(now);
  expect(
    isEngineRuntimeReady({ shuttingDown: false, pool: pool.snapshot() })
  ).toBe(false);
});

test('successful cleanup of a failed warming worker still permits bounded retry', async () => {
  let creations = 0;
  let now = 10_000;
  const pool = new EngineWorkerPool(
    async () => {
      creations += 1;
      const worker = new FakeWorker(`worker-${creations}`);
      if (creations > 2) worker.warmError = new Error('injected_warm_failure');
      return worker;
    },
    {
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
    }
  );
  await pool.start();
  const lease = await pool.acquire();
  await lease?.settle('engine_crashed');

  expect(creations).toBe(7);
  expect(pool.snapshot().circuitOpenUntilMs).toBeGreaterThan(now);
  expect(await pool.acquire()).toBeNull();
});

test('confirmed-terminated partial start leaves the pool empty and retryable', async () => {
  const workers: FakeWorker[] = [];
  const pool = new EngineWorkerPool(async () => {
    const worker = new FakeWorker(`worker-${workers.length + 1}`);
    if (workers.length === 1) worker.warmError = new Error('injected_warm_failure');
    workers.push(worker);
    return worker;
  });

  await expect(pool.start()).rejects.toThrow('injected_warm_failure');
  expect(pool.snapshot()).toMatchObject({ accepting: false, workers: [] });
  expect(workers[0]?.terminateCalls).toBeGreaterThanOrEqual(1);
  expect(workers[1]?.terminateCalls).toBe(1);

  await pool.start();
  expect(pool.snapshot().accepting).toBe(true);
  expect(pool.snapshot().workers).toHaveLength(2);
  await pool.shutdown();
});
