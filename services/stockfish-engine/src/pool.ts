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
  private readonly replacementFailures: number[] = [];
  private accepting = false;
  private circuitOpenUntilMs: number | null = null;
  private replenishment: Promise<void> | null = null;

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
    if (!this.accepting || this.isCircuitOpen()) return null;
    await this.replenishCapacity();
    const slot = this.slots.find((candidate) => candidate.state === 'IDLE');
    if (!slot) return null;

    slot.state = 'LEASED';
    let transport: EngineTransport;
    try {
      transport = await slot.worker.prepareLease();
    } catch (error) {
      await this.replaceFailedSlot(slot);
      throw error;
    }

    let settled = false;
    return {
      workerId: slot.worker.id,
      transport,
      settle: async (outcome) => {
        if (settled) return false;
        settled = true;
        transport.close();
        await this.settleSlot(slot, outcome);
        return true;
      },
    };
  }

  async shutdown(): Promise<void> {
    this.accepting = false;
    await this.replenishment;
    await this.retryRetainedTerminations();
  }

  snapshot(): EngineWorkerPoolSnapshot {
    this.pruneReplacementFailures();
    return {
      accepting: this.accepting,
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
      if (this.shouldRecycle(slot)) {
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

  private shouldRecycle(slot: WorkerSlot): boolean {
    const rss = slot.worker.residentMemoryBytes();
    return (
      slot.completedSearches >= this.maxCompletedSearches ||
      this.now() - slot.createdAtMs >= this.maxWorkerAgeMs ||
      (rss !== null && rss >= this.maxResidentMemoryBytes)
    );
  }

  /** Warm replacement first, then retire the healthy old worker. */
  private async recycleHealthySlot(slot: WorkerSlot): Promise<void> {
    if (this.slots.some((candidate) => candidate !== slot && candidate.orphaned && candidate.state === 'RETIRING')) {
      slot.state = 'IDLE';
      this.openCircuit();
      return;
    }
    slot.state = 'RETIRING';
    let replacement: WorkerSlot;
    try {
      replacement = await this.createWarmSlotWithRetry({ promote: false });
    } catch {
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
      this.openCircuit();
      return;
    }

    this.removeSlot(slot);
    replacement.state = 'IDLE';
  }

  private async replaceFailedSlot(slot: WorkerSlot): Promise<void> {
    slot.state = 'RETIRING';
    try {
      await slot.worker.terminate();
    } catch {
      slot.state = 'RETIRING';
      slot.orphaned = true;
      this.openCircuit();
      return;
    }
    this.removeSlot(slot);
    try {
      await this.createWarmSlotWithRetry({ promote: true });
    } catch {
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
    await replenishment;
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
        await this.createWarmSlotWithRetry({ promote: true });
      } catch {
        return;
      }
    }
  }

  private usableCapacityCount(): number {
    return this.slots.filter(
      (slot) => slot.state !== 'RETIRING' && slot.state !== 'TERMINATED'
    ).length;
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
      if (this.isCircuitOpen()) throw lastError;
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
        await this.sleep(REPLACEMENT_BACKOFF_MS[index] ?? 5_000);
      }
    }
    this.openCircuit();
    throw lastError;
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
      this.circuitOpenUntilMs = null;
      this.replacementFailures.length = 0;
    }
  }

  private isCircuitOpen(): boolean {
    this.pruneReplacementFailures();
    return this.circuitOpenUntilMs !== null;
  }
}
