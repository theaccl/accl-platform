import { EngineFailure, type EngineAnalysisResult, type EngineTransport } from '@/lib/chess';
import {
  clampEngineRuntimeRequest,
  parseEngineRuntimeRequest,
  runtimeFailureEnvelope,
  type ApprovedRuntimeRequest,
  type EngineRuntimeEnvelope,
  type EngineRuntimeFailureCode,
} from '@/lib/chess/runtime';
import { parsePosition, PositionParseError, type ParsedPosition } from '@/lib/chess/position';
import { EngineWorkerPool, type EngineWorkerLease, type WorkerLeaseOutcome } from '@/services/stockfish-engine/src/pool';
import {
  EngineRuntimeScheduler,
  type SchedulerDispatch,
} from '@/services/stockfish-engine/src/scheduler';

export type EngineLeaseExecutor = (input: {
  request: ApprovedRuntimeRequest;
  position: ParsedPosition;
  transport: EngineTransport;
}) => Promise<EngineAnalysisResult>;

type PendingJob = {
  request: ApprovedRuntimeRequest;
  position: ParsedPosition;
  resolve: (envelope: EngineRuntimeEnvelope) => void;
  signal?: AbortSignal;
  abortListener?: () => void;
  cancelRunning?: () => void;
  settled: boolean;
};

type RunningJob = {
  pending: PendingJob;
  dispatch: SchedulerDispatch<PendingJob>;
  lease: EngineWorkerLease;
  searchTimer: ReturnType<typeof setTimeout>;
  totalTimer: ReturnType<typeof setTimeout>;
  finish: (
    envelope: EngineRuntimeEnvelope,
    outcome: WorkerLeaseOutcome
  ) => Promise<boolean>;
};

export type EngineRuntimeCoordinatorOptions = {
  now?: () => number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
};

export class EngineRuntimeCoordinator {
  private readonly scheduler = new EngineRuntimeScheduler<PendingJob>();
  private readonly running = new Set<RunningJob>();
  private readonly now: () => number;
  private readonly setTimer: typeof setTimeout;
  private readonly clearTimer: typeof clearTimeout;
  private wakeTimer: ReturnType<typeof setTimeout> | null = null;
  private pumping = false;
  private shuttingDown = false;

  constructor(
    private readonly pool: EngineWorkerPool,
    private readonly execute: EngineLeaseExecutor,
    options: EngineRuntimeCoordinatorOptions = {}
  ) {
    this.now = options.now ?? (() => performance.now());
    this.setTimer = options.setTimer ?? setTimeout;
    this.clearTimer = options.clearTimer ?? clearTimeout;
  }

  evaluate(value: unknown, signal?: AbortSignal): Promise<EngineRuntimeEnvelope> {
    if (this.shuttingDown) return Promise.resolve(runtimeFailureEnvelope('ENGINE_POOL_UNAVAILABLE'));

    let request: ApprovedRuntimeRequest;
    let position: ParsedPosition;
    try {
      const parsed = parseEngineRuntimeRequest(value);
      position = parsePosition(parsed.engineFen);
      request = clampEngineRuntimeRequest({ ...parsed, engineFen: position.engineFen });
    } catch (error) {
      const code: EngineRuntimeFailureCode =
        error instanceof PositionParseError ? 'INVALID_POSITION' : 'ENGINE_PROTOCOL_ERROR';
      return Promise.resolve(runtimeFailureEnvelope(code));
    }

    if (signal?.aborted) {
      return Promise.resolve(runtimeFailureEnvelope('ENGINE_REQUEST_CANCELLED'));
    }

    return new Promise<EngineRuntimeEnvelope>((resolve) => {
      const pending: PendingJob = {
        request,
        position,
        resolve,
        signal,
        settled: false,
      };
      const admission = this.scheduler.admit(request, pending, this.now());
      if (!admission.ok) {
        pending.settled = true;
        resolve(runtimeFailureEnvelope(admission.rejection.code));
        return;
      }

      if (signal) {
        pending.abortListener = () => {
          if (pending.settled) return;
          const cancelled = this.scheduler.cancel(request.correlationId);
          if (cancelled) {
            this.settlePending(pending, 'ENGINE_REQUEST_CANCELLED');
            this.scheduleWake();
            void this.pump();
            return;
          }
          pending.cancelRunning?.();
        };
        signal.addEventListener('abort', pending.abortListener, { once: true });
      }

      this.scheduleWake();
      void this.pump();
    });
  }

  async shutdown(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    if (this.wakeTimer) this.clearTimer(this.wakeTimer);
    this.wakeTimer = null;

    for (const rejection of this.scheduler.stopAccepting()) {
      this.settlePending(rejection.value, 'ENGINE_POOL_UNAVAILABLE');
    }
    await this.pool.shutdown();
    await Promise.all(
      [...this.running].map((job) =>
        job.finish(runtimeFailureEnvelope('ENGINE_POOL_UNAVAILABLE'), 'engine_crashed')
      )
    );
  }

  snapshot() {
    return {
      scheduler: this.scheduler.snapshot(),
      pool: this.pool.snapshot(),
      runningRequests: this.running.size,
      shuttingDown: this.shuttingDown,
    };
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.shuttingDown) return;
    this.pumping = true;
    try {
      this.expireQueued();
      while (!this.shuttingDown && this.scheduler.snapshot().waiting > 0) {
        const dispatch = this.scheduler.dispatch(this.now());
        if (!dispatch) break;
        let lease: EngineWorkerLease | null;
        try {
          lease = await this.pool.acquire();
        } catch {
          dispatch.release();
          this.settlePending(
            dispatch.value,
            this.shuttingDown ? 'ENGINE_POOL_UNAVAILABLE' : 'ENGINE_CRASHED'
          );
          continue;
        }
        if (!lease) {
          dispatch.release();
          this.settlePending(dispatch.value, 'ENGINE_POOL_UNAVAILABLE');
          continue;
        }
        this.run(dispatch, lease);
      }
    } finally {
      this.pumping = false;
      this.scheduleWake();
    }
  }

  private run(dispatch: SchedulerDispatch<PendingJob>, lease: EngineWorkerLease): void {
    const pending = dispatch.value;
    const now = this.now();
    const searchDelay = Math.max(0, pending.request.limits.timeoutMs);
    const totalDelay = Math.max(0, dispatch.totalDeadlineMs - now);

    const running = {} as RunningJob;
    let finished = false;
    const finish: RunningJob['finish'] = async (envelope, outcome) => {
      if (finished) return false;
      finished = true;
      pending.settled = true;
      this.clearTimer(running.searchTimer);
      this.clearTimer(running.totalTimer);
      this.detachAbort(pending);
      this.running.delete(running);
      pending.resolve(envelope);
      try {
        await lease.settle(outcome);
      } catch {
        // Recycle/reset/terminate failure must not replace the already-resolved envelope.
      } finally {
        dispatch.release();
        void this.pump();
      }
      return true;
    };

    Object.assign(running, {
      pending,
      dispatch,
      lease,
      finish,
      searchTimer: this.setTimer(() => {
        void finish(runtimeFailureEnvelope('ENGINE_SEARCH_TIMEOUT'), 'search_timeout');
      }, searchDelay),
      totalTimer: this.setTimer(() => {
        void finish(runtimeFailureEnvelope('ENGINE_TOTAL_TIMEOUT'), 'total_timeout');
      }, totalDelay),
    });
    pending.cancelRunning = () => {
      void finish(runtimeFailureEnvelope('ENGINE_REQUEST_CANCELLED'), 'caller_cancelled');
    };
    this.running.add(running);

    void this.execute({
      request: pending.request,
      position: pending.position,
      transport: lease.transport,
    }).then(
      (result) => finish({ ok: true, result }, 'success'),
      (error) => {
        if (this.shuttingDown) {
          return finish(runtimeFailureEnvelope('ENGINE_POOL_UNAVAILABLE'), 'engine_crashed');
        }
        const mapped = mapEngineError(error);
        return finish(runtimeFailureEnvelope(mapped.code), mapped.outcome);
      }
    );
  }

  private expireQueued(): void {
    for (const rejection of this.scheduler.expire(this.now())) {
      this.settlePending(rejection.value, rejection.code);
    }
  }

  private settlePending(pending: PendingJob, code: EngineRuntimeFailureCode): void {
    if (pending.settled) return;
    pending.settled = true;
    this.detachAbort(pending);
    pending.resolve(runtimeFailureEnvelope(code));
  }

  private detachAbort(pending: PendingJob): void {
    if (pending.signal && pending.abortListener) {
      pending.signal.removeEventListener('abort', pending.abortListener);
    }
    pending.abortListener = undefined;
    pending.cancelRunning = undefined;
  }

  private scheduleWake(): void {
    if (this.shuttingDown) return;
    if (this.wakeTimer) this.clearTimer(this.wakeTimer);
    const deadline = this.scheduler.nextDeadlineMs();
    if (deadline === null) {
      this.wakeTimer = null;
      return;
    }
    this.wakeTimer = this.setTimer(() => {
      this.wakeTimer = null;
      this.expireQueued();
      void this.pump();
    }, Math.max(0, deadline - this.now()));
  }
}

function mapEngineError(error: unknown): {
  code: EngineRuntimeFailureCode;
  outcome: WorkerLeaseOutcome;
} {
  if (!(error instanceof EngineFailure)) {
    return { code: 'ENGINE_CRASHED', outcome: 'engine_crashed' };
  }
  switch (error.code) {
    case 'INVALID_POSITION':
      return { code: 'ENGINE_PROTOCOL_ERROR', outcome: 'protocol_error' };
    case 'ENGINE_TIMEOUT':
      return { code: 'ENGINE_SEARCH_TIMEOUT', outcome: 'search_timeout' };
    case 'ENGINE_CRASH':
      return { code: 'ENGINE_CRASHED', outcome: 'engine_crashed' };
    case 'MALFORMED_UCI':
    case 'PV_MISMATCH':
    case 'CONTRADICTORY_UCI':
      return { code: 'ENGINE_PROTOCOL_ERROR', outcome: 'protocol_error' };
  }
}
