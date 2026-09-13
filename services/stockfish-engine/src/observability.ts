import type { EngineRuntimeFailureCode, EngineRuntimeLane } from '@/lib/chess/runtime';
import type { EngineWorkerPoolSnapshot, EngineWorkerState } from './pool';

export type EngineOutcome = 'success' | EngineRuntimeFailureCode;
export type EngineLatencyPhase = 'queue' | 'search' | 'total';
export type EnginePoolEvent =
  | 'job_recycle' | 'age_recycle' | 'rss_recycle'
  | 'replacement_attempt' | 'replacement_success' | 'replacement_failure' | 'circuit_open';

export type EngineRuntimeIdentityLabels = {
  engineCommit: string;
  bigNnueSha256: string;
  smallNnueSha256: string;
  imageDigest: string;
  cloudRunRevision: string;
};

type LatencyAggregate = { count: number; sumMs: number; maxMs: number; buckets: Record<string, number> };

export type EngineRuntimeMetricSnapshot = {
  identity: EngineRuntimeIdentityLabels;
  queueDepthByLane: Record<EngineRuntimeLane, number>;
  oldestQueueAgeMsByLane: Record<EngineRuntimeLane, number>;
  latencies: Readonly<Record<string, LatencyAggregate>>;
  outcomes: Readonly<Record<string, number>>;
  poolEvents: Readonly<Record<EnginePoolEvent, number>>;
  workerStates: Readonly<Record<EngineWorkerState, number>>;
  processRss: { measuredWorkers: number; unavailableWorkers: number; totalBytes: number; maxBytes: number };
  accepting: boolean;
  circuitOpen: boolean;
};

const LATENCY_BUCKETS_MS = [25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 20_000] as const;
const WORKER_STATES: readonly EngineWorkerState[] = [
  'STARTING', 'WARMING', 'IDLE', 'LEASED', 'RESETTING', 'RETIRING', 'TERMINATED',
];
const POOL_EVENTS: readonly EnginePoolEvent[] = [
  'job_recycle', 'age_recycle', 'rss_recycle', 'replacement_attempt',
  'replacement_success', 'replacement_failure', 'circuit_open',
];

function laneNumbers(): Record<EngineRuntimeLane, number> {
  return { BOT_LIVE: 0, TRAINER_INTERACTIVE: 0, PROTECTED_REVIEW: 0, POST_GAME_BATCH: 0 };
}

function fixedCounts<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

/** Bounded-label telemetry only. It has no API that accepts FEN, request, actor, or transcript data. */
export class EngineRuntimeTelemetry {
  private readonly queueDepthByLane = laneNumbers();
  private readonly oldestQueueAgeMsByLane = laneNumbers();
  private readonly latencies = new Map<string, LatencyAggregate>();
  private readonly outcomes = new Map<string, number>();
  private readonly poolEvents = fixedCounts(POOL_EVENTS);
  private readonly workerStates = fixedCounts(WORKER_STATES);
  private readonly identity: EngineRuntimeIdentityLabels;
  private processRss = { measuredWorkers: 0, unavailableWorkers: 0, totalBytes: 0, maxBytes: 0 };
  private accepting = false;
  private circuitOpen = false;
  private readonly emitEvent?: (record: string) => void;

  constructor(
    identity: Partial<EngineRuntimeIdentityLabels> = {},
    options: { emitEvent?: (record: string) => void } = {}
  ) {
    this.identity = sanitizeIdentity(identity);
    this.emitEvent = options.emitEvent;
  }

  setQueue(lane: EngineRuntimeLane, depth: number, oldestAgeMs: number): void {
    this.queueDepthByLane[lane] = nonNegativeInteger(depth);
    this.oldestQueueAgeMsByLane[lane] = nonNegativeInteger(oldestAgeMs);
  }

  recordLatency(lane: EngineRuntimeLane, phase: EngineLatencyPhase, milliseconds: number): void {
    const value = nonNegativeInteger(milliseconds);
    const key = `${lane}:${phase}`;
    const aggregate = this.latencies.get(key) ?? {
      count: 0, sumMs: 0, maxMs: 0,
      buckets: Object.fromEntries([...LATENCY_BUCKETS_MS.map(String), '+Inf'].map((bucket) => [bucket, 0])),
    };
    aggregate.count += 1;
    aggregate.sumMs += value;
    aggregate.maxMs = Math.max(aggregate.maxMs, value);
    for (const boundary of LATENCY_BUCKETS_MS) {
      if (value <= boundary) aggregate.buckets[String(boundary)] += 1;
    }
    aggregate.buckets['+Inf'] += 1;
    this.latencies.set(key, aggregate);
    this.emit({ event: 'accl_engine_latency', lane, phase, latencyMs: value });
  }

  recordOutcome(lane: EngineRuntimeLane, outcome: EngineOutcome): void {
    const key = `${lane}:${outcome}`;
    this.outcomes.set(key, (this.outcomes.get(key) ?? 0) + 1);
    this.emit({ event: 'accl_engine_outcome', lane, outcome });
  }

  recordPoolEvent(event: EnginePoolEvent): void {
    this.poolEvents[event] += 1;
    this.emit({ event: 'accl_engine_pool_event', poolEvent: event });
  }

  refreshPool(snapshot: EngineWorkerPoolSnapshot): void {
    for (const state of WORKER_STATES) this.workerStates[state] = 0;
    let measuredWorkers = 0;
    let unavailableWorkers = 0;
    let totalBytes = 0;
    let maxBytes = 0;
    for (const worker of snapshot.workers) {
      this.workerStates[worker.state] += 1;
      const rss = worker.residentMemoryBytes;
      if (rss === null) unavailableWorkers += 1;
      else {
        measuredWorkers += 1;
        totalBytes += nonNegativeInteger(rss);
        maxBytes = Math.max(maxBytes, nonNegativeInteger(rss));
      }
    }
    this.processRss = { measuredWorkers, unavailableWorkers, totalBytes, maxBytes };
    this.accepting = snapshot.accepting;
    this.circuitOpen = snapshot.circuitOpenUntilMs !== null;
  }

  snapshot(): EngineRuntimeMetricSnapshot {
    return {
      identity: { ...this.identity },
      queueDepthByLane: { ...this.queueDepthByLane },
      oldestQueueAgeMsByLane: { ...this.oldestQueueAgeMsByLane },
      latencies: Object.fromEntries([...this.latencies].map(([key, value]) => [key, { ...value, buckets: { ...value.buckets } }])),
      outcomes: Object.fromEntries(this.outcomes),
      poolEvents: { ...this.poolEvents }, workerStates: { ...this.workerStates },
      processRss: { ...this.processRss }, accepting: this.accepting, circuitOpen: this.circuitOpen,
    };
  }

  structuredRecord(): { event: 'accl_engine_runtime_metrics'; metrics: EngineRuntimeMetricSnapshot } {
    return { event: 'accl_engine_runtime_metrics', metrics: this.snapshot() };
  }

  private emit(record: object): void {
    try {
      this.emitEvent?.(JSON.stringify(record));
    } catch {
      // Telemetry is best-effort and may never alter request or pool settlement.
    }
  }
}

export type EngineTelemetryExporterOptions = {
  intervalMs?: number;
  write?: (record: string) => void;
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
};

/** Cloud Run captures this fixed-schema JSON from stdout; no request data enters the exporter. */
export class EngineTelemetryExporter {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly intervalMs: number;
  private readonly write: (record: string) => void;
  private readonly setIntervalFn: typeof globalThis.setInterval;
  private readonly clearIntervalFn: typeof globalThis.clearInterval;

  constructor(
    private readonly telemetry: EngineRuntimeTelemetry,
    private readonly refresh: () => void,
    options: EngineTelemetryExporterOptions = {}
  ) {
    this.intervalMs = options.intervalMs ?? 10_000;
    this.write = options.write ?? ((record) => process.stdout.write(`${record}\n`));
    this.setIntervalFn = options.setInterval ?? globalThis.setInterval;
    this.clearIntervalFn = options.clearInterval ?? globalThis.clearInterval;
  }

  start(): void {
    if (this.timer) return;
    this.emit();
    try {
      this.timer = this.setIntervalFn(() => this.emit(), this.intervalMs);
      this.timer.unref?.();
    } catch {
      this.timer = null;
    }
  }

  stop(): void {
    if (!this.timer) return;
    try {
      this.clearIntervalFn(this.timer);
    } catch {
      // Timer cleanup failure must not alter service shutdown.
    }
    this.timer = null;
  }

  emit(): void {
    try {
      this.refresh();
    } catch {
      // Preserve the last safe snapshot when refresh fails.
    }
    try {
      this.write(JSON.stringify(this.telemetry.structuredRecord()));
    } catch {
      // Logging failure must never crash or stall the engine service.
    }
  }
}

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function sanitizeIdentity(identity: Partial<EngineRuntimeIdentityLabels>): EngineRuntimeIdentityLabels {
  return {
    engineCommit: /^[a-f0-9]{40}$/.test(identity.engineCommit ?? '') ? identity.engineCommit! : 'unknown',
    bigNnueSha256: /^[a-f0-9]{64}$/.test(identity.bigNnueSha256 ?? '') ? identity.bigNnueSha256! : 'unknown',
    smallNnueSha256: /^[a-f0-9]{64}$/.test(identity.smallNnueSha256 ?? '') ? identity.smallNnueSha256! : 'unknown',
    imageDigest: /^sha256:[a-f0-9]{64}$/.test(identity.imageDigest ?? '') ? identity.imageDigest! : 'unassigned',
    cloudRunRevision: /^[a-z0-9][a-z0-9-]{0,62}$/.test(identity.cloudRunRevision ?? '')
      ? identity.cloudRunRevision!
      : 'local',
  };
}
