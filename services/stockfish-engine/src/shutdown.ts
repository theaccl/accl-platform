import type { EngineRuntimeCoordinator } from '@/services/stockfish-engine/src/coordinator';

type ShutdownCoordinator = Pick<EngineRuntimeCoordinator, 'shutdown'>;

export type EngineServiceShutdownResult = 'complete' | 'timed_out';

type TimerHandle = ReturnType<typeof setTimeout>;
type TimerSetter = (callback: () => void, delayMs: number) => TimerHandle;
type TimerClearer = (timer: TimerHandle) => void;

export type EngineShutdownServer = {
  close(callback: (error?: Error) => void): unknown;
  closeAllConnections(): void;
};

export type EngineServiceShutdownOptions = {
  timeoutMs: number;
  setTimer?: TimerSetter;
  clearTimer?: TimerClearer;
};

/** Exactly-once drain: close HTTP admission, settle runtime work, then close sockets. */
export function createEngineServiceShutdown(
  server: EngineShutdownServer,
  coordinator: ShutdownCoordinator,
  options: EngineServiceShutdownOptions
): () => Promise<EngineServiceShutdownResult> {
  const setTimer = options.setTimer ?? setTimeout;
  const clearTimer = options.clearTimer ?? clearTimeout;
  let shutdownPromise: Promise<EngineServiceShutdownResult> | null = null;

  return () => {
    shutdownPromise ??= runShutdown();
    return shutdownPromise;
  };

  async function runShutdown(): Promise<EngineServiceShutdownResult> {
    if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1) {
      throw new Error('engine_shutdown_timeout_invalid');
    }

    const httpClosed = new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    const drained = Promise.allSettled([coordinator.shutdown(), httpClosed]);

    return await new Promise<EngineServiceShutdownResult>((resolve) => {
      let settled = false;
      const finish = (result: EngineServiceShutdownResult) => {
        if (settled) return;
        settled = true;
        clearTimer(timer);
        resolve(result);
      };
      const timer = setTimer(() => {
        server.closeAllConnections();
        finish('timed_out');
      }, options.timeoutMs);
      void drained.then(() => finish('complete'));
    });
  }
}

export type ShutdownSignalPort = {
  once(signal: NodeJS.Signals, listener: () => void): void;
  exit(code: number): never;
};

/** A hard watchdog bounds process lifetime if child termination cannot be observed. */
export function installEngineShutdownSignals(
  shutdown: () => Promise<EngineServiceShutdownResult>,
  signalPort: ShutdownSignalPort = process,
  hardExitMs = 9_000,
  setTimer: TimerSetter = setTimeout,
  clearTimer: TimerClearer = clearTimeout
): void {
  let received = false;
  const handle = () => {
    if (received) return;
    received = true;
    const watchdog = setTimer(() => signalPort.exit(1), hardExitMs);
    void shutdown().then(
      (result) => {
        clearTimer(watchdog);
        if (result === 'timed_out') signalPort.exit(1);
      },
      () => {
        clearTimer(watchdog);
        signalPort.exit(1);
      }
    );
  };
  signalPort.once('SIGTERM', handle);
  signalPort.once('SIGINT', handle);
}
