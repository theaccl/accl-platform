import { expect, test } from '@playwright/test';

import {
  createEngineServiceShutdown,
  installEngineShutdownSignals,
  type EngineServiceShutdownResult,
} from '@/services/stockfish-engine/src/shutdown';

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('shutdown closes HTTP admission first, drains once, and waits for socket close', async () => {
  const order: string[] = [];
  const coordinatorGate = gate();
  let closeCallback: (() => void) | undefined;
  let forced = 0;
  const server = {
    close(callback: () => void) {
      order.push('http-close');
      closeCallback = callback;
      return server;
    },
    closeAllConnections() {
      forced += 1;
    },
  };
  const coordinator = {
    async shutdown() {
      order.push('coordinator-shutdown');
      await coordinatorGate.promise;
    },
  };
  const shutdown = createEngineServiceShutdown(server, coordinator, { timeoutMs: 1_000 });

  const first = shutdown();
  const second = shutdown();
  expect(first).toBe(second);
  expect(order).toEqual(['http-close', 'coordinator-shutdown']);
  coordinatorGate.resolve();
  closeCallback?.();
  await expect(first).resolves.toBe('complete');
  expect(forced).toBe(0);
});

test('shutdown timeout force-closes HTTP connections and remains exactly once', async () => {
  const timers: Array<() => void> = [];
  let forced = 0;
  const server = {
    close() {
      return server;
    },
    closeAllConnections() {
      forced += 1;
    },
  };
  const shutdown = createEngineServiceShutdown(
    server,
    { async shutdown() { await new Promise(() => undefined); } },
    {
      timeoutMs: 10,
      setTimer: (callback: () => void) => {
        timers.push(callback);
        return timers.length as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimer: () => undefined,
    }
  );

  const result = shutdown();
  timers[0]?.();
  await expect(result).resolves.toBe('timed_out');
  await expect(shutdown()).resolves.toBe('timed_out');
  expect(forced).toBe(1);
});

test('SIGTERM and SIGINT share one shutdown and hard exit only on failure', async () => {
  const listeners = new Map<NodeJS.Signals, () => void>();
  const exits: number[] = [];
  let calls = 0;
  let resolve!: (result: EngineServiceShutdownResult) => void;
  const shutdownResult = new Promise<EngineServiceShutdownResult>((done) => {
    resolve = done;
  });
  installEngineShutdownSignals(
    async () => {
      calls += 1;
      return await shutdownResult;
    },
    {
      once(signal, listener) {
        listeners.set(signal, listener);
      },
      exit(code): never {
        exits.push(code);
        throw new Error('test_exit');
      },
    },
    100,
    () => 1 as unknown as ReturnType<typeof setTimeout>,
    () => undefined
  );

  listeners.get('SIGTERM')?.();
  listeners.get('SIGINT')?.();
  expect(calls).toBe(1);
  resolve('complete');
  await expect.poll(() => exits.length).toBe(0);
});
