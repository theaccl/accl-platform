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

test('failed-slot replacement reserves capacity before a concurrent acquire', async () => {
  let creations = 0;
  let releaseReplacement!: () => void;
  const replacementFactory = new Promise<void>((resolve) => {
    releaseReplacement = resolve;
  });
  const pool = new EngineWorkerPool(
    async () => {
      creations += 1;
      if (creations === 3) await replacementFactory;
      return new FakeWorker(`worker-${creations}`);
    },
    { sleep: async () => {} }
  );
  await pool.start();
  const failed = await pool.acquire();
  const settling = failed?.settle('engine_crashed');
  await expect.poll(() => creations).toBe(3);

  const concurrent = await pool.acquire();
  expect(concurrent?.workerId).toBe('worker-2');
  expect(creations).toBe(3);

  releaseReplacement();
  await settling;
  expect(pool.snapshot().workers).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'worker-2', state: 'LEASED' }),
      expect.objectContaining({ id: 'worker-3', state: 'IDLE' }),
    ])
  );
  expect(pool.snapshot().workers).toHaveLength(2);
  await concurrent?.settle('success');
});

test('failed-slot replacement reserves capacity while termination is pending', async () => {
  let creations = 0;
  let terminateStarted!: () => void;
  let releaseTerminate!: () => void;
  const started = new Promise<void>((resolve) => {
    terminateStarted = resolve;
  });
  const termination = new Promise<void>((resolve) => {
    releaseTerminate = resolve;
  });
  const pool = new EngineWorkerPool(
    async () => {
      creations += 1;
      const worker = new FakeWorker(`worker-${creations}`);
      if (creations === 1) {
        worker.terminate = async () => {
          worker.terminateCalls += 1;
          terminateStarted();
          await termination;
        };
      }
      return worker;
    },
    { sleep: async () => {} }
  );
  await pool.start();
  const failed = await pool.acquire();
  const settling = failed?.settle('engine_crashed');
  await started;

  const concurrent = await pool.acquire();
  expect(concurrent?.workerId).toBe('worker-2');
  expect(creations).toBe(2);

  releaseTerminate();
  await settling;
  expect(creations).toBe(3);
  expect(pool.snapshot().workers).toHaveLength(2);
  await concurrent?.settle('success');
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

test('RSS threshold recycles a healthy worker and records the bounded reason', async () => {
  const workers: FakeWorker[] = [];
  const events: string[] = [];
  const pool = new EngineWorkerPool(
    async () => {
      const worker = new FakeWorker(`worker-${workers.length + 1}`);
      worker.rss = workers.length === 0 ? 513 : 1;
      workers.push(worker);
      return worker;
    },
    {
      maxResidentMemoryBytes: 512,
      observer: { recordPoolEvent: (event) => events.push(event) },
      sleep: async () => {},
    }
  );
  await pool.start();
  const lease = await pool.acquire();
  await lease?.settle('success');

  expect(events).toEqual(['rss_recycle', 'replacement_attempt', 'replacement_success']);
  expect(pool.snapshot().workers.map((worker) => worker.id).sort()).toEqual(['worker-2', 'worker-3']);
  await pool.shutdown();
});

test('required process RSS measurement fails closed and replaces an unmeasurable worker', async () => {
  const workers: FakeWorker[] = [];
  const pool = new EngineWorkerPool(
    async () => {
      const worker = new FakeWorker(`worker-${workers.length + 1}`);
      worker.rss = workers.length === 0 ? null : 1;
      workers.push(worker);
      return worker;
    },
    { requireResidentMemoryMeasurement: true, sleep: async () => {} }
  );
  await pool.start();

  await expect(pool.acquire()).rejects.toThrow('engine_process_rss_unavailable');
  expect(workers[0]?.prepareCalls).toBe(0);
  expect(pool.snapshot().workers.map((worker) => worker.id).sort()).toEqual(['worker-2', 'worker-3']);
  await pool.shutdown();
});

test('required RSS is rechecked after lease preparation and a disappearing measurement is never leased', async () => {
  const workers: FakeWorker[] = [];
  const pool = new EngineWorkerPool(
    async () => {
      const worker = new FakeWorker(`worker-${workers.length + 1}`);
      if (workers.length === 0) {
        worker.prepareLease = async () => {
          worker.prepareCalls += 1;
          worker.rss = null;
          return inertTransport();
        };
      }
      workers.push(worker);
      return worker;
    },
    { requireResidentMemoryMeasurement: true, sleep: async () => {} }
  );
  await pool.start();

  await expect(pool.acquire()).rejects.toThrow('engine_process_rss_unavailable');
  expect(workers[0]?.prepareCalls).toBe(1);
  expect(workers[0]?.terminateCalls).toBe(1);
  expect(pool.snapshot().workers.map((worker) => worker.id).sort()).toEqual(['worker-2', 'worker-3']);
  await pool.shutdown();
});

test('throwing telemetry observer cannot strand a recycle or alter capacity', async () => {
  let creations = 0;
  const pool = new EngineWorkerPool(
    async () => new FakeWorker(`worker-${++creations}`),
    {
      maxCompletedSearches: 1,
      observer: { recordPoolEvent: () => { throw new Error('telemetry_sink_failed'); } },
      sleep: async () => {},
    }
  );
  await pool.start();
  const lease = await pool.acquire();
  await expect(lease?.settle('success')).resolves.toBe(true);
  expect(pool.snapshot().workers).toHaveLength(2);
  expect(pool.snapshot().workers.every((worker) => worker.state === 'IDLE')).toBe(true);
  await pool.shutdown();
});

test('healthy recycling reserves capacity before a concurrent acquire', async () => {
  let creations = 0;
  let releaseReplacement!: () => void;
  const replacementFactory = new Promise<void>((resolve) => {
    releaseReplacement = resolve;
  });
  const pool = new EngineWorkerPool(
    async () => {
      creations += 1;
      if (creations === 3) await replacementFactory;
      return new FakeWorker(`worker-${creations}`);
    },
    { maxCompletedSearches: 1, sleep: async () => {} }
  );
  await pool.start();
  const recycled = await pool.acquire();
  const settling = recycled?.settle('success');
  await expect.poll(() => creations).toBe(3);

  const concurrent = await pool.acquire();
  expect(concurrent?.workerId).toBe('worker-2');
  expect(creations).toBe(3);

  releaseReplacement();
  await settling;
  expect(pool.snapshot().workers).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'worker-2', state: 'LEASED' }),
      expect.objectContaining({ id: 'worker-3', state: 'IDLE' }),
    ])
  );
  expect(pool.snapshot().workers).toHaveLength(2);
  await concurrent?.settle('success');
});

test('shutdown drains a failed-slot replacement before terminating the pool', async () => {
  let creations = 0;
  let releaseReplacement!: () => void;
  const replacementFactory = new Promise<void>((resolve) => {
    releaseReplacement = resolve;
  });
  const pool = new EngineWorkerPool(
    async () => {
      creations += 1;
      if (creations === 3) await replacementFactory;
      return new FakeWorker(`worker-${creations}`);
    },
    { sleep: async () => {} }
  );
  await pool.start();
  const failed = await pool.acquire();
  const settling = failed?.settle('engine_crashed');
  await expect.poll(() => creations).toBe(3);

  let shutdownDone = false;
  const shuttingDown = pool.shutdown().then(() => {
    shutdownDone = true;
  });
  await Promise.resolve();
  expect(shutdownDone).toBe(false);

  releaseReplacement();
  await Promise.all([settling, shuttingDown]);
  expect(pool.snapshot()).toMatchObject({ accepting: false, workers: [] });
});

test('shutdown interrupts replacement backoff before draining maintenance', async () => {
  let creations = 0;
  let sleepStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    sleepStarted = resolve;
  });
  const pool = new EngineWorkerPool(
    async () => {
      creations += 1;
      const worker = new FakeWorker(`worker-${creations}`);
      if (creations === 3) worker.warmError = new Error('injected_replacement_failure');
      return worker;
    },
    {
      sleep: async () => {
        sleepStarted();
        await new Promise<void>(() => {});
      },
    }
  );
  await pool.start();
  const failed = await pool.acquire();
  const settling = failed?.settle('engine_crashed');
  await started;

  await Promise.all([settling, pool.shutdown()]);
  expect(creations).toBe(3);
  expect(pool.snapshot()).toMatchObject({ accepting: false, workers: [] });
});

test('shutdown drains healthy recycling before terminating the pool', async () => {
  let creations = 0;
  let releaseReplacement!: () => void;
  const replacementFactory = new Promise<void>((resolve) => {
    releaseReplacement = resolve;
  });
  const pool = new EngineWorkerPool(
    async () => {
      creations += 1;
      if (creations === 3) await replacementFactory;
      return new FakeWorker(`worker-${creations}`);
    },
    { maxCompletedSearches: 1, sleep: async () => {} }
  );
  await pool.start();
  const recycled = await pool.acquire();
  const settling = recycled?.settle('success');
  await expect.poll(() => creations).toBe(3);

  let shutdownDone = false;
  const shuttingDown = pool.shutdown().then(() => {
    shutdownDone = true;
  });
  await Promise.resolve();
  expect(shutdownDone).toBe(false);

  releaseReplacement();
  await Promise.all([settling, shuttingDown]);
  expect(pool.snapshot()).toMatchObject({ accepting: false, workers: [] });
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

test('lease preparation is discarded when a peer opens the circuit', async () => {
  let creations = 0;
  let prepareStarted!: () => void;
  let releasePrepare!: () => void;
  const started = new Promise<void>((resolve) => {
    prepareStarted = resolve;
  });
  const preparation = new Promise<void>((resolve) => {
    releasePrepare = resolve;
  });
  const workers: FakeWorker[] = [];
  const pool = new EngineWorkerPool(
    async () => {
      creations += 1;
      if (creations > 2) throw new Error('injected_replacement_failure');
      const worker = new FakeWorker(`worker-${creations}`);
      if (creations === 1) {
        worker.prepareLease = async () => {
          worker.prepareCalls += 1;
          prepareStarted();
          await preparation;
          return inertTransport();
        };
      }
      workers.push(worker);
      return worker;
    },
    { sleep: async () => {} }
  );
  await pool.start();
  const preparing = pool.acquire();
  await started;
  const peer = await pool.acquire();
  await peer?.settle('engine_crashed');
  expect(pool.snapshot().circuitOpenUntilMs).not.toBeNull();

  releasePrepare();
  expect(await preparing).toBeNull();
  expect(workers[0]?.resetCalls).toBe(1);
  expect(pool.snapshot().workers).toEqual([
    expect.objectContaining({ id: 'worker-1', state: 'IDLE' }),
  ]);
});

test('lease preparation failure after shutdown cannot create a replacement', async () => {
  let creations = 0;
  let prepareStarted!: () => void;
  let rejectPrepare!: (error: Error) => void;
  const started = new Promise<void>((resolve) => {
    prepareStarted = resolve;
  });
  const preparation = new Promise<void>((_resolve, reject) => {
    rejectPrepare = reject;
  });
  const pool = new EngineWorkerPool(async () => {
    creations += 1;
    const worker = new FakeWorker(`worker-${creations}`);
    if (creations === 1) {
      worker.prepareLease = async () => {
        worker.prepareCalls += 1;
        prepareStarted();
        await preparation;
        return inertTransport();
      };
    }
    return worker;
  });
  await pool.start();
  const preparing = pool.acquire();
  await started;
  await pool.shutdown();

  rejectPrepare(new Error('late_prepare_failure'));
  await expect(preparing).rejects.toThrow('late_prepare_failure');
  expect(creations).toBe(2);
  expect(pool.snapshot()).toMatchObject({ accepting: false, workers: [] });
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

test('replacement warm and terminate failure remains fail closed after circuit expiry', async () => {
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
  expect(await pool.acquire()).toBeNull();
  expect(workers[1]?.prepareCalls).toBe(0);
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
