import {
  ENGINE_MAX_DEPTH,
  ENGINE_MAX_MULTIPV,
} from '@/lib/chess/engine/stockfishAdapter';
import type { EngineSearchLimits } from '@/lib/chess/engine/types';
import type { EngineRuntimeLane, EngineRuntimeRequest } from '@/lib/chess/runtime/contracts';

export type EngineRuntimeLanePolicy = {
  weight: number;
  waitingCap: number;
  queueCeilingMs: number;
  searchCeilingMs: number;
  totalCeilingMs: number;
  partition: 'interactive' | 'batch';
};

export const ENGINE_RUNTIME_WORKER_COUNT = 2;
export const ENGINE_RUNTIME_WAITING_CAP = 8;
export const ENGINE_RUNTIME_BATCH_RUNNING_CAP = 1;

export const ENGINE_RUNTIME_LANE_POLICIES: Readonly<
  Record<EngineRuntimeLane, EngineRuntimeLanePolicy>
> = {
  BOT_LIVE: {
    weight: 8,
    waitingCap: 4,
    queueCeilingMs: 250,
    searchCeilingMs: 12_000,
    totalCeilingMs: 14_000,
    partition: 'interactive',
  },
  TRAINER_INTERACTIVE: {
    weight: 4,
    waitingCap: 4,
    queueCeilingMs: 1_500,
    searchCeilingMs: 9_000,
    totalCeilingMs: 12_000,
    partition: 'interactive',
  },
  PROTECTED_REVIEW: {
    weight: 2,
    waitingCap: 2,
    queueCeilingMs: 3_000,
    searchCeilingMs: 12_000,
    totalCeilingMs: 17_000,
    partition: 'batch',
  },
  POST_GAME_BATCH: {
    weight: 1,
    waitingCap: 1,
    queueCeilingMs: 5_000,
    searchCeilingMs: 15_000,
    totalCeilingMs: 22_000,
    partition: 'batch',
  },
};

export type ApprovedRuntimeRequest = EngineRuntimeRequest & {
  limits: Required<EngineSearchLimits>;
  remainingBudgetMs: number;
};

function finiteFloor(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
}

export function clampEngineRuntimeRequest(request: EngineRuntimeRequest): ApprovedRuntimeRequest {
  const policy = ENGINE_RUNTIME_LANE_POLICIES[request.lane];
  const requestedTimeout = finiteFloor(request.limits.timeoutMs, policy.searchCeilingMs);

  return {
    ...request,
    limits: {
      depth: Math.min(ENGINE_MAX_DEPTH, Math.max(1, finiteFloor(request.limits.depth, 12))),
      multiPv: Math.min(ENGINE_MAX_MULTIPV, Math.max(1, finiteFloor(request.limits.multiPv, 1))),
      timeoutMs: Math.min(policy.searchCeilingMs, Math.max(1, requestedTimeout)),
    },
    remainingBudgetMs: Math.min(
      policy.totalCeilingMs,
      Math.max(1, Math.floor(request.remainingBudgetMs))
    ),
  };
}

export function runtimeSchedulingCost(request: ApprovedRuntimeRequest): number {
  return Math.max(1, Math.ceil(request.limits.timeoutMs / 1_000));
}
