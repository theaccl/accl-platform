import {
  ENGINE_RUNTIME_BATCH_RUNNING_CAP,
  ENGINE_RUNTIME_LANE_POLICIES,
  ENGINE_RUNTIME_LANES,
  ENGINE_RUNTIME_WAITING_CAP,
  ENGINE_RUNTIME_WORKER_COUNT,
  runtimeSchedulingCost,
  type ApprovedRuntimeRequest,
  type EngineRuntimeFailureCode,
  type EngineRuntimeLane,
} from '@/lib/chess/runtime';

type QueueEntry<T> = {
  request: ApprovedRuntimeRequest;
  value: T;
  admittedAtMs: number;
  queueDeadlineMs: number;
  totalDeadlineMs: number;
  cost: number;
};

export type SchedulerRejected<T> = {
  code: EngineRuntimeFailureCode;
  request: ApprovedRuntimeRequest;
  value: T;
};

export type SchedulerAdmission<T> =
  | { ok: true }
  | { ok: false; rejection: SchedulerRejected<T> };

export type SchedulerSnapshot = {
  accepting: boolean;
  waiting: number;
  waitingByLane: Record<EngineRuntimeLane, number>;
  oldestQueueAgeMsByLane: Record<EngineRuntimeLane, number>;
  running: number;
  runningBatch: number;
};

export type SchedulerDispatch<T> = {
  request: ApprovedRuntimeRequest;
  value: T;
  admittedAtMs: number;
  dispatchedAtMs: number;
  totalDeadlineMs: number;
  release(): boolean;
};

function createLaneMap<T>(factory: () => T): Record<EngineRuntimeLane, T> {
  return {
    BOT_LIVE: factory(),
    TRAINER_INTERACTIVE: factory(),
    PROTECTED_REVIEW: factory(),
    POST_GAME_BATCH: factory(),
  };
}

export class EngineRuntimeScheduler<T> {
  private readonly queues = createLaneMap<Array<QueueEntry<T>>>(() => []);
  private readonly deficits = createLaneMap(() => 0);
  private accepting = true;
  private waiting = 0;
  private running = 0;
  private runningBatch = 0;
  private cursor = 0;
  private readonly queuedIds = new Set<string>();
  private readonly runningIds = new Set<string>();

  admit(request: ApprovedRuntimeRequest, value: T, nowMs: number): SchedulerAdmission<T> {
    if (!this.accepting) return this.reject('ENGINE_POOL_UNAVAILABLE', request, value);
    if (!Number.isFinite(nowMs)) return this.reject('ENGINE_PROTOCOL_ERROR', request, value);
    if (this.queuedIds.has(request.correlationId) || this.runningIds.has(request.correlationId)) {
      return this.reject('ENGINE_PROTOCOL_ERROR', request, value);
    }

    const policy = ENGINE_RUNTIME_LANE_POLICIES[request.lane];
    if (this.waiting >= ENGINE_RUNTIME_WAITING_CAP || this.queues[request.lane].length >= policy.waitingCap) {
      return this.reject('ENGINE_OVERLOADED', request, value);
    }

    const totalBudgetMs = Math.min(policy.totalCeilingMs, request.remainingBudgetMs);
    this.queues[request.lane].push({
      request,
      value,
      admittedAtMs: nowMs,
      queueDeadlineMs: nowMs + Math.min(policy.queueCeilingMs, totalBudgetMs),
      totalDeadlineMs: nowMs + totalBudgetMs,
      cost: runtimeSchedulingCost(request),
    });
    this.waiting += 1;
    this.queuedIds.add(request.correlationId);
    return { ok: true };
  }

  cancel(correlationId: string): SchedulerRejected<T> | null {
    for (const lane of ENGINE_RUNTIME_LANES) {
      const queue = this.queues[lane];
      const index = queue.findIndex((entry) => entry.request.correlationId === correlationId);
      if (index < 0) continue;
      const [entry] = queue.splice(index, 1);
      if (!entry) return null;
      this.removeQueued(entry);
      return { code: 'ENGINE_REQUEST_CANCELLED', request: entry.request, value: entry.value };
    }
    return null;
  }

  expire(nowMs: number): Array<SchedulerRejected<T>> {
    const expired: Array<SchedulerRejected<T>> = [];
    for (const lane of ENGINE_RUNTIME_LANES) {
      const queue = this.queues[lane];
      for (let index = 0; index < queue.length; ) {
        const entry = queue[index];
        if (!entry || nowMs < Math.min(entry.queueDeadlineMs, entry.totalDeadlineMs)) {
          index += 1;
          continue;
        }
        queue.splice(index, 1);
        this.removeQueued(entry);
        expired.push({
          code: nowMs >= entry.totalDeadlineMs ? 'ENGINE_TOTAL_TIMEOUT' : 'ENGINE_QUEUE_TIMEOUT',
          request: entry.request,
          value: entry.value,
        });
      }
    }
    return expired;
  }

  dispatch(
    nowMs: number,
    settleExpired: (rejection: SchedulerRejected<T>) => void
  ): SchedulerDispatch<T> | null {
    if (this.running >= ENGINE_RUNTIME_WORKER_COUNT || this.waiting === 0) return null;
    for (const rejection of this.expire(nowMs)) settleExpired(rejection);
    if (this.waiting === 0) return null;

    const maxVisits = ENGINE_RUNTIME_LANES.length * 32;
    for (let visits = 0; visits < maxVisits; visits += 1) {
      const lane = ENGINE_RUNTIME_LANES[this.cursor];
      if (!lane) continue;

      const queue = this.queues[lane];
      const entry = queue[0];
      if (!entry || !this.partitionAllows(lane)) {
        this.advanceCursor();
        continue;
      }

      if (this.deficits[lane] < entry.cost) {
        this.deficits[lane] += ENGINE_RUNTIME_LANE_POLICIES[lane].weight;
      }
      if (this.deficits[lane] < entry.cost) {
        this.advanceCursor();
        continue;
      }

      this.deficits[lane] -= entry.cost;
      queue.shift();
      this.removeQueued(entry);
      this.running += 1;
      if (ENGINE_RUNTIME_LANE_POLICIES[lane].partition === 'batch') this.runningBatch += 1;
      this.runningIds.add(entry.request.correlationId);

      const next = queue[0];
      if (!next || this.deficits[lane] < next.cost) this.advanceCursor();

      let released = false;
      return {
        request: entry.request,
        value: entry.value,
        admittedAtMs: entry.admittedAtMs,
        dispatchedAtMs: nowMs,
        totalDeadlineMs: entry.totalDeadlineMs,
        release: () => {
          if (released) return false;
          released = true;
          this.running = Math.max(0, this.running - 1);
          if (ENGINE_RUNTIME_LANE_POLICIES[lane].partition === 'batch') {
            this.runningBatch = Math.max(0, this.runningBatch - 1);
          }
          this.runningIds.delete(entry.request.correlationId);
          return true;
        },
      };
    }

    return null;
  }

  stopAccepting(): Array<SchedulerRejected<T>> {
    this.accepting = false;
    const rejected: Array<SchedulerRejected<T>> = [];
    for (const lane of ENGINE_RUNTIME_LANES) {
      const queue = this.queues[lane];
      while (queue.length > 0) {
        const entry = queue.shift();
        if (!entry) continue;
        this.removeQueued(entry);
        rejected.push({ code: 'ENGINE_POOL_UNAVAILABLE', request: entry.request, value: entry.value });
      }
    }
    return rejected;
  }

  snapshot(nowMs = performance.now()): SchedulerSnapshot {
    return {
      accepting: this.accepting,
      waiting: this.waiting,
      waitingByLane: {
        BOT_LIVE: this.queues.BOT_LIVE.length,
        TRAINER_INTERACTIVE: this.queues.TRAINER_INTERACTIVE.length,
        PROTECTED_REVIEW: this.queues.PROTECTED_REVIEW.length,
        POST_GAME_BATCH: this.queues.POST_GAME_BATCH.length,
      },
      oldestQueueAgeMsByLane: {
        BOT_LIVE: this.oldestAge('BOT_LIVE', nowMs),
        TRAINER_INTERACTIVE: this.oldestAge('TRAINER_INTERACTIVE', nowMs),
        PROTECTED_REVIEW: this.oldestAge('PROTECTED_REVIEW', nowMs),
        POST_GAME_BATCH: this.oldestAge('POST_GAME_BATCH', nowMs),
      },
      running: this.running,
      runningBatch: this.runningBatch,
    };
  }

  nextDeadlineMs(): number | null {
    let next = Number.POSITIVE_INFINITY;
    for (const lane of ENGINE_RUNTIME_LANES) {
      for (const entry of this.queues[lane]) {
        next = Math.min(next, entry.queueDeadlineMs, entry.totalDeadlineMs);
      }
    }
    return Number.isFinite(next) ? next : null;
  }

  private partitionAllows(lane: EngineRuntimeLane): boolean {
    const policy = ENGINE_RUNTIME_LANE_POLICIES[lane];
    return policy.partition === 'interactive' || this.runningBatch < ENGINE_RUNTIME_BATCH_RUNNING_CAP;
  }

  private advanceCursor(): void {
    this.cursor = (this.cursor + 1) % ENGINE_RUNTIME_LANES.length;
  }

  private removeQueued(entry: QueueEntry<T>): void {
    this.waiting = Math.max(0, this.waiting - 1);
    this.queuedIds.delete(entry.request.correlationId);
  }

  private oldestAge(lane: EngineRuntimeLane, nowMs: number): number {
    const admittedAtMs = this.queues[lane][0]?.admittedAtMs;
    return admittedAtMs === undefined ? 0 : Math.max(0, Math.floor(nowMs - admittedAtMs));
  }

  private reject(
    code: EngineRuntimeFailureCode,
    request: ApprovedRuntimeRequest,
    value: T
  ): SchedulerAdmission<T> {
    return { ok: false, rejection: { code, request, value } };
  }
}
