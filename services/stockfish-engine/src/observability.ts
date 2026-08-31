import type { EngineRuntimeFailureCode, EngineRuntimeLane } from '@/lib/chess/runtime';

export type EngineOutcome = 'success' | EngineRuntimeFailureCode;

export type EngineRuntimeMetricSnapshot = {
  queueDepthByLane: Record<EngineRuntimeLane, number>;
  oldestQueueAgeMsByLane: Record<EngineRuntimeLane, number>;
  outcomes: Readonly<Record<string, number>>;
  workerStates: Readonly<Record<string, number>>;
  processRssBytes: number;
};

function laneNumbers(): Record<EngineRuntimeLane, number> {
  return {
    BOT_LIVE: 0,
    TRAINER_INTERACTIVE: 0,
    PROTECTED_REVIEW: 0,
    POST_GAME_BATCH: 0,
  };
}

/** Bounded-label telemetry only. It has no API that accepts FEN or transcripts. */
export class EngineRuntimeTelemetry {
  private readonly queueDepthByLane = laneNumbers();
  private readonly oldestQueueAgeMsByLane = laneNumbers();
  private readonly outcomes = new Map<string, number>();
  private readonly workerStates = new Map<string, number>();
  private processRssBytes = 0;

  setQueue(lane: EngineRuntimeLane, depth: number, oldestAgeMs: number): void {
    this.queueDepthByLane[lane] = nonNegativeInteger(depth);
    this.oldestQueueAgeMsByLane[lane] = nonNegativeInteger(oldestAgeMs);
  }

  recordOutcome(lane: EngineRuntimeLane, outcome: EngineOutcome): void {
    const key = `${lane}:${outcome}`;
    this.outcomes.set(key, (this.outcomes.get(key) ?? 0) + 1);
  }

  setWorkerState(state: string, count: number): void {
    this.workerStates.set(state, nonNegativeInteger(count));
  }

  setProcessRssBytes(bytes: number): void {
    this.processRssBytes = nonNegativeInteger(bytes);
  }

  snapshot(): EngineRuntimeMetricSnapshot {
    return {
      queueDepthByLane: { ...this.queueDepthByLane },
      oldestQueueAgeMsByLane: { ...this.oldestQueueAgeMsByLane },
      outcomes: Object.fromEntries(this.outcomes),
      workerStates: Object.fromEntries(this.workerStates),
      processRssBytes: this.processRssBytes,
    };
  }
}

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}
