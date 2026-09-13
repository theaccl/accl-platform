import { runtimeFailure, type EngineRuntimeFailure } from '@/lib/chess/runtime/contracts';

type WaitingOperation<T> = {
  run: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
};

type ActorState = {
  running: boolean;
  waiting: WaitingOperation<unknown> | null;
};

export class EngineActorLimitError extends Error {
  readonly failure: EngineRuntimeFailure;

  constructor(code: 'ENGINE_ACTOR_LIMIT' | 'ENGINE_REQUEST_CANCELLED') {
    super(code.toLowerCase());
    this.name = 'EngineActorLimitError';
    this.failure = runtimeFailure(code);
  }
}

/**
 * Per-process upstream limiter. Actor/game scope is used only as a Map key and
 * never becomes part of the runtime request, response, error, or telemetry.
 */
export class EngineActorLimiter {
  private readonly states = new Map<string, ActorState>();

  run<T>(actorScope: string, operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!actorScope) return Promise.reject(new EngineActorLimitError('ENGINE_ACTOR_LIMIT'));
    if (signal?.aborted) return Promise.reject(new EngineActorLimitError('ENGINE_REQUEST_CANCELLED'));

    const state = this.states.get(actorScope) ?? { running: false, waiting: null };
    this.states.set(actorScope, state);

    if (!state.running) {
      state.running = true;
      return this.execute(actorScope, state, operation);
    }
    if (state.waiting) return Promise.reject(new EngineActorLimitError('ENGINE_ACTOR_LIMIT'));

    return new Promise<T>((resolve, reject) => {
      const waiting: WaitingOperation<T> = { run: operation, resolve, reject, signal };
      if (signal) {
        waiting.onAbort = () => {
          if (state.waiting !== waiting) return;
          state.waiting = null;
          reject(new EngineActorLimitError('ENGINE_REQUEST_CANCELLED'));
        };
        signal.addEventListener('abort', waiting.onAbort, { once: true });
      }
      state.waiting = waiting as WaitingOperation<unknown>;
    });
  }

  snapshot(): { actors: number; running: number; waiting: number } {
    let running = 0;
    let waiting = 0;
    for (const state of this.states.values()) {
      if (state.running) running += 1;
      if (state.waiting) waiting += 1;
    }
    return { actors: this.states.size, running, waiting };
  }

  private async execute<T>(
    actorScope: string,
    state: ActorState,
    operation: () => Promise<T>
  ): Promise<T> {
    try {
      return await operation();
    } finally {
      this.advance(actorScope, state);
    }
  }

  private advance(actorScope: string, state: ActorState): void {
    const waiting = state.waiting;
    state.waiting = null;
    if (!waiting) {
      state.running = false;
      this.states.delete(actorScope);
      return;
    }

    if (waiting.signal && waiting.onAbort) {
      waiting.signal.removeEventListener('abort', waiting.onAbort);
    }
    if (waiting.signal?.aborted) {
      waiting.reject(new EngineActorLimitError('ENGINE_REQUEST_CANCELLED'));
      this.advance(actorScope, state);
      return;
    }

    void this.execute(actorScope, state, waiting.run).then(waiting.resolve, waiting.reject);
  }
}
