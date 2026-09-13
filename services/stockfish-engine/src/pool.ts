import type { EngineTransport } from '@/lib/chess/engine/types';

export type PhysicalEngineWorker = {
  readonly id: string;
  warm(): Promise<void>;
  prepareLease(): Promise<EngineTransport>;
  resetAfterLease(): Promise<void>;
  recoverAfterInterrupt(): Promise<boolean>;
  residentMemoryBytes(): number | null;
  terminate(): Promise<void>;
};

export type PhysicalEngineWorkerFactory = () => Promise<PhysicalEngineWorker>;

export type WorkerLeaseOutcome =
  | 'success'
  | 'caller_cancelled'
  | 'search_timeout'
  | 'total_timeout'
  | 'engine_crashed'
  | 'protocol_error';

export type EngineWorkerState =
  | 'STARTING'
  | 'WARMING'
  | 'IDLE'
  | 'LEASED'
  | 'RESETTING'
  | 'RETIRING'
  | 'TERMINATED';

type WorkerSlot = {
  worker: PhysicalEngineWorker;
  state: EngineWorkerState;
  createdAtMs: number;
  completedSearches: number;
  orphaned: boolean;
};

export type EngineWorkerLease = {
  workerId: string;
  transport: EngineTransport;
  settle(outcome: WorkerLeaseOutcome): Promise<boolean>;
};

export type EngineWorkerPoolSnapshot = {
  accepting: boolean;
  requiresResidentMemoryMeasurement: boolean;
  circuitOpenUntilMs: number | null;
  workers: Array<{
    id: string;
    state: EngineWorkerState;
    completedSearches: number;
    residentMemoryBytes: number | null;
  }>;
};

export type EngineWorkerPoolOptions = {
  workerCount?: 2;
  maxCompletedSearches?: number;
  maxWorkerAgeMs?: number;
  maxResidentMemoryBytes?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  requireResidentMemoryMeasurement?: boolean;
  observer?: { recordPoolEvent(event: 'job_recycle' | 'age_recycle' | 'rss_recycle' | 'replacement_attempt' | 'replacement_success' | 'replacement_failure' | 'circuit_open'): void };
};

const REPLACEMENT_BACKOFF_MS = [250, 500, 1_000, 2_000, 5_000] as const;
const FAILURE_WINDOW_MS = 60_000;
export const CIRCUIT_OPEN_MS = 30_000;

class WarmCleanupFailedError extends Error {
  constructor() {
    super('engine_warm_cleanup_failed');
    this.name = 'WarmCleanupFailedError';
  }
}

export class EngineWorkerPool {
  private readonly slots: WorkerSlot[] = [];
  private readonly workerCount: 2;
  private readonly maxCompletedSearches: number;
  private readonly maxWorkerAgeMs: number;
  private readonly maxResidentMemoryBytes: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly requireResidentMemoryMeasurement: boolean;
  private readonly observer?: EngineWorkerPoolOptions['observer'];
  private readonly replacementFailures: number[] = [];
  private readonly maintenanceTasks = new Set<Promise<unknown>>();
  private readonly maintenanceStop: Promise<void>;
  private resolveMaintenanceStop: () => void = () => {};
  private accepting = false;
  private circuitOpenUntilMs: number | null = null;
  private replenishment: Promise<void> | null = null;
  private pendingCapacity = 0;

  constructor(
    private readonly factory: PhysicalEngineWorkerFactory,
    options: EngineWorkerPoolOptions = {}
  ) {
    this.workerCount = options.workerCount ?? 2;
    this.maxCompletedSearches = options.maxCompletedSearches ?? 250;
    this.maxWorkerAgeMs = options.maxWorkerAgeMs ?? 60 * 60 * 1_000;
    this.maxResidentMemoryBytes = options.maxResidentMemoryBytes ?? Number.POSITIVE_INFINITY;
    this.now = options.now ?? (() => performance.now());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.requireResidentMemoryMeasurement = options.requireResidentMemoryMeasurement ?? false;
    this.observer = options.observer;
    this.maintenanceStop = new Promise<void>((resolve) => {
      this.resolveMaintenanceStop = resolve;
    });
  }

  async start(): Promise<void> {
    if (this.accepting || this.slots.length > 0) {
      throw new Error('engine_pool_already_started');
    }
    try {
      for (let index = 0; index < this.workerCount; index += 1) {
        await this.createWarmSlot({ promote: true });
      }
      this.accepting = true;
    } catch (error) {
      this.accepting = false;
      await this.retryRetainedTerminations();
      throw error;
    }
  }

  async acquire(): Promise<EngineWorkerLease | null> {
    if (!this.canLease()) return null;
    await this.replenishCapacity();
    if (!this.canLease()) return null;
    const slot = this.slots.find((candidate) => candidate.state === 'IDLE');
    if (!slot) return null;
    if (this.requireResidentMemoryMeasurement && slot.worker.residentMemoryBytes() === null) {
      await this.replaceFailedSlot(slot);
      throw new Error('engine_process_rss_unavailable');
    }

    slot.state = 'LEASED';
    let transport: EngineTransport;
    try {
      transport = await slot.worker.prepareLease();
    } catch (error) {
      await this.replaceFailedSlot(slot);
      throw error;
    }
    if (this.requireResidentMemoryMeasurement && slot.worker.residentMemoryBytes() === null) {
      transport.close();
      await this.replaceFailedSlot(slot);
      throw new Error('engine_process_rss_unavailable');
    }
    if (!this.canLease()) {
      transport.close();
      await this.runMaintenance(() => this.resetPreparedSlot(slot));
      return null;
    }

    let settled = false;
    return {
      workerId: slot.worker.id,
      transport,
      settle: async (outcome) => {
        if (settled) return false;
        settled = true;
        transport.close();
        await this.runMaintenance(() => this.settleSlot(slot, outcome));
        return true;
      },
    };
  }

  async shutdown(): Promise<void> {
    this.accepting = false;
    this.resolveMaintenanceStop();
    await this.drainMaintenance();
    await this.retryRetainedTerminations();
  }

  snapshot(): EngineWorkerPoolSnapshot {
    this.pruneReplacementFailures();
    return {
      accepting: this.accepting,
      requiresResidentMemoryMeasurement: this.requireResidentMemoryMeasurement,
      circuitOpenUntilMs: this.circuitOpenUntilMs,
      workers: this.slots.map((slot) => ({
        id: slot.worker.id,
        state: slot.state,
        completedSearches: slot.completedSearches,
        residentMemoryBytes: slot.worker.residentMemoryBytes(),
      })),
    };
  }

  private async settleSlot(slot: WorkerSlot, outcome: WorkerLeaseOutcome): Promise<void> {
    if (!this.slots.includes(slot) || slot.state === 'TERMINATED') return;

    if (outcome === 'success') {
      slot.state = 'RESETTING';
      try {
        await slot.worker.resetAfterLease();
        slot.completedSearches += 1;
      } catch {
        await this.replaceFailedSlot(slot);
        return;
      }
      const recycleReason = this.recycleReason(slot);
      if (recycleReason) {
        this.recordEvent(recycleReason);
        await this.recycleHealthySlot(slot);
      } else {
        slot.state = 'IDLE';
      }
      return;
    }

    if (
      outcome === 'caller_cancelled' ||
      outcome === 'search_timeout' ||
      outcome === 'total_timeout'
    ) {
      slot.state = 'RESETTING';
      let recovered = false;
      try {
        recovered = await slot.worker.recoverAfterInterrupt();
      } catch {
        recovered = false;
      }
      if (recovered) {
        slot.state = 'IDLE';
        return;
      }
    }

    await this.replaceFailedSlot(slot);
  }

  private async resetPreparedSlot(slot: WorkerSlot): Promise<void> {
    if (!this.slots.includes(slot) || slot.state === 'TERMINATED') return;
    slot.state = 'RESETTING';
    try {
      await slot.worker.resetAfterLease();
      slot.state = 'IDLE';
    } catch {
      await this.replaceFailedSlot(slot);
    }
  }

  private recycleReason(slot: WorkerSlot): 'job_recycle' | 'age_recycle' | 'rss_recycle' | null {
    const rss = slot.worker.residentMemoryBytes();
    if (slot.completedSearches >= this.maxCompletedSearches) return 'job_recycle';
    if (this.now() - slot.createdAtMs >= this.maxWorkerAgeMs) return 'age_recycle';
    if (rss !== null && rss >= this.maxResidentMemoryBytes) return 'rss_recycle';
    return null;
  }

  /** Warm replacement first, then retire the healthy old worker. */
  private recycleHealthySlot(slot: WorkerSlot): Promise<void> {
    return this.runMaintenance(() =>
      this.withCapacityReservation(() => this.recycleHealthySlotReserved(slot))
    );
  }

  private async recycleHealthySlotReserved(slot: WorkerSlot): Promise<void> {
    if (
      this.slots.some(
        (candidate) =>
          candidate !== slot && candidate.orphaned && candidate.state === 'RETIRING'
      )
    ) {
      slot.state = 'IDLE';
      this.openCircuit();
      return;
    }
    slot.state = 'RETIRING';
    let replacement: WorkerSlot;
    this.recordEvent('replacement_attempt');
    try {
      replacement = await this.createWarmSlotWithRetry({ promote: false });
    } catch {
      this.recordEvent('replacement_failure');
      if (this.slots.includes(slot) && slot.state === 'RETIRING') {
        slot.state = 'IDLE';
      }
      this.openCircuit();
      return;
    }

    try {
      await slot.worker.terminate();
    } catch {
      slot.state = 'RETIRING';
      slot.orphaned = true;
      replacement.state = 'RETIRING';
      try {
        await replacement.worker.terminate();
        this.removeSlot(replacement);
      } catch {
        replacement.state = 'RETIRING';
        replacement.orphaned = true;
      }
      this.recordEvent('replacement_failure');
      this.openCircuit();
      return;
    }

    this.removeSlot(slot);
    replacement.state = 'IDLE';
    this.recordEvent('replacement_success');
  }

  private replaceFailedSlot(slot: WorkerSlot): Promise<void> {
    return this.runMaintenance(() =>
      this.withCapacityReservation(() => this.replaceFailedSlotReserved(slot))
    );
  }

  private async replaceFailedSlotReserved(slot: WorkerSlot): Promise<void> {
    this.recordEvent('replacement_attempt');
    slot.state = 'RETIRING';
    try {
      await slot.worker.terminate();
    } catch {
      slot.state = 'RETIRING';
      slot.orphaned = true;
      this.recordEvent('replacement_failure');
      this.openCircuit();
      return;
    }
    this.removeSlot(slot);
    if (!this.accepting) return;
    try {
      await this.createWarmSlotWithRetry({ promote: true });
      this.recordEvent('replacement_success');
    } catch {
      this.recordEvent('replacement_failure');
      // Circuit or leftover RETIRING replacement is already recorded.
    }
  }

  private async replenishCapacity(): Promise<void> {
    if (this.replenishment) {
      await this.replenishment;
      return;
    }

    const replenishment = this.replenishMissingSlots().finally(() => {
      if (this.replenishment === replenishment) this.replenishment = null;
    });
    this.replenishment = replenishment;
    await this.trackMaintenance(replenishment);
  }

  private async replenishMissingSlots(): Promise<void> {
    if (!this.accepting || this.isCircuitOpen()) return;
    if (this.slots.some((slot) => slot.orphaned && slot.state === 'RETIRING')) {
      this.openCircuit();
      return;
    }

    while (
      this.accepting &&
      !this.isCircuitOpen() &&
      this.usableCapacityCount() < this.workerCount
    ) {
      try {
        await this.withCapacityReservation(() =>
          this.createWarmSlotWithRetry({ promote: true })
        );
      } catch {
        return;
      }
    }
  }

  private usableCapacityCount(): number {
    return (
      this.pendingCapacity +
      this.slots.filter(
        (slot) => slot.state !== 'RETIRING' && slot.state !== 'TERMINATED'
      ).length
    );
  }

  private async createWarmSlot(options: { promote: boolean }): Promise<WorkerSlot> {
    const worker = await this.factory();
    const slot: WorkerSlot = {
      worker,
      state: 'WARMING',
      createdAtMs: this.now(),
      completedSearches: 0,
      orphaned: false,
    };
    this.slots.push(slot);
    try {
      await worker.warm();
      if (options.promote) slot.state = 'IDLE';
      return slot;
    } catch (error) {
      slot.state = 'RETIRING';
      try {
        await worker.terminate();
        this.removeSlot(slot);
      } catch {
        slot.state = 'RETIRING';
        slot.orphaned = true;
        this.openCircuit();
        throw new WarmCleanupFailedError();
      }
      throw error;
    }
  }

  private async createWarmSlotWithRetry(options: { promote: boolean }): Promise<WorkerSlot> {
    let lastError: unknown = new Error('engine_replacement_failed');
    for (let index = 0; index < REPLACEMENT_BACKOFF_MS.length; index += 1) {
      if (!this.accepting || this.isCircuitOpen()) throw lastError;
      try {
        const slot = await this.createWarmSlot(options);
        this.pruneReplacementFailures();
        return slot;
      } catch (error) {
        lastError = error;
        if (error instanceof WarmCleanupFailedError) {
          this.openCircuit();
          throw error;
        }
        this.recordReplacementFailure();
        if (this.isCircuitOpen()) break;
        await Promise.race([
          this.sleep(REPLACEMENT_BACKOFF_MS[index] ?? 5_000),
          this.maintenanceStop,
        ]);
        if (!this.accepting) throw lastError;
      }
    }
    this.openCircuit();
    throw lastError;
  }

  private async withCapacityReservation<T>(operation: () => Promise<T>): Promise<T> {
    this.pendingCapacity += 1;
    try {
      return await operation();
    } finally {
      this.pendingCapacity -= 1;
    }
  }

  private trackMaintenance<T>(task: Promise<T>): Promise<T> {
    this.maintenanceTasks.add(task);
    void task.then(
      () => this.maintenanceTasks.delete(task),
      () => this.maintenanceTasks.delete(task)
    );
    return task;
  }

  private runMaintenance<T>(operation: () => Promise<T>): Promise<T> {
    return this.trackMaintenance(operation());
  }

  private async drainMaintenance(): Promise<void> {
    while (this.maintenanceTasks.size > 0) {
      await Promise.allSettled([...this.maintenanceTasks]);
    }
  }

  private async retryRetainedTerminations(): Promise<void> {
    await Promise.all(
      [...this.slots].map(async (slot) => {
        if (slot.state === 'TERMINATED') {
          this.removeSlot(slot);
          return;
        }
        slot.state = 'RETIRING';
        try {
          await slot.worker.terminate();
          this.removeSlot(slot);
        } catch {
          slot.state = 'RETIRING';
          slot.orphaned = true;
        }
      })
    );
  }

  private removeSlot(slot: WorkerSlot): void {
    const index = this.slots.indexOf(slot);
    if (index >= 0) this.slots.splice(index, 1);
  }

  private openCircuit(): void {
    if (this.circuitOpenUntilMs === null || this.now() >= this.circuitOpenUntilMs) {
      this.recordEvent('circuit_open');
    }
    this.circuitOpenUntilMs = this.now() + CIRCUIT_OPEN_MS;
  }

  private recordReplacementFailure(): void {
    const now = this.now();
    this.replacementFailures.push(now);
    this.pruneReplacementFailures();
    if (this.replacementFailures.length >= 5) this.openCircuit();
  }

  private pruneReplacementFailures(): void {
    const minimum = this.now() - FAILURE_WINDOW_MS;
    while ((this.replacementFailures[0] ?? Number.POSITIVE_INFINITY) < minimum) {
      this.replacementFailures.shift();
    }
    if (this.circuitOpenUntilMs !== null && this.now() >= this.circuitOpenUntilMs) {
      if (this.hasRetainedOrphan()) {
        this.openCircuit();
        return;
      }
      this.circuitOpenUntilMs = null;
      this.replacementFailures.length = 0;
    }
  }

  private hasRetainedOrphan(): boolean {
    return this.slots.some((slot) => slot.orphaned && slot.state === 'RETIRING');
  }

  private canLease(): boolean {
    return this.accepting && !this.isCircuitOpen() && !this.hasRetainedOrphan();
  }

  private isCircuitOpen(): boolean {
    this.pruneReplacementFailures();
    return this.circuitOpenUntilMs !== null;
  }

  private recordEvent(
    event: Parameters<NonNullable<EngineWorkerPoolOptions['observer']>['recordPoolEvent']>[0]
  ): void {
    try {
      this.observer?.recordPoolEvent(event);
    } catch {
      // Observability must never alter worker lifecycle or capacity ownership.
    }
  }
}
