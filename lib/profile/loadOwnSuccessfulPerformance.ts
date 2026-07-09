import type { SupabaseClient } from '@supabase/supabase-js';

import {
  BROAD_MODE_UNLOCK_THRESHOLD,
  broadModeRouteBSatisfied,
  resolveBroadModeUnlockState,
} from '@/lib/profile/successfulPerformanceUnlock';
import type {
  ExactControlUnlockDescriptor,
  PlayerColor,
  RatingModeName,
  SuccessfulPerformanceAggregate,
} from '@/lib/profile/successfulPerformanceTypes';
import {
  SUCCESSFUL_PERFORMANCE_BROAD_MODE_COLORS,
  SUCCESSFUL_PERFORMANCE_BROAD_MODES,
  SUCCESSFUL_PERFORMANCE_ROUTE_B_CONTROLS,
  type SuccessfulPerformanceBroadModeColor,
} from '@/lib/profile/successfulPerformanceRouteBControls';

export const SUCCESSFUL_PERFORMANCE_CONTRACT_VERSION = 'successful_performance_v1';

type RpcSourceStatus = 'available' | 'unavailable';

type RpcAggregateCell = {
  scope?: string;
  mode?: string | null;
  color?: string;
  exact_control?: string | null;
  tournament_id?: string | null;
  games?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  eligible_games?: number;
  score?: number | null;
  percentage?: number | null;
  unlocked?: boolean;
  source_status?: string;
};

type RpcEnvelope = {
  contract_version?: string;
  source_status?: string;
  free_play?: {
    modes?: RpcAggregateCell[];
    exact_controls?: RpcAggregateCell[];
  };
  battlefield?: {
    lifetime?: RpcAggregateCell;
    tournaments?: RpcAggregateCell[];
  };
};

export type BroadModeSuccessfulPerformanceAggregates = Record<
  RatingModeName,
  Record<SuccessfulPerformanceBroadModeColor, SuccessfulPerformanceAggregate>
>;

export type OwnSuccessfulPerformanceLoaded = {
  status: 'loaded';
  broadModeAggregates: BroadModeSuccessfulPerformanceAggregates;
  exactControlUnlocksByMode: Record<RatingModeName, ExactControlUnlockDescriptor[]>;
  battlefieldLifetime: SuccessfulPerformanceAggregate;
};

export type OwnSuccessfulPerformanceResult =
  | { status: 'unavailable' }
  | { status: 'invalid'; reason: string }
  | OwnSuccessfulPerformanceLoaded;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function narrowSourceStatus(value: unknown): RpcSourceStatus | null {
  if (value === 'available') return 'available';
  if (value === 'unavailable') return 'unavailable';
  return null;
}

function isRatingModeName(value: unknown): value is RatingModeName {
  return (
    value === 'bullet' ||
    value === 'blitz' ||
    value === 'rapid' ||
    value === 'daily'
  );
}

function isBroadModeColor(value: unknown): value is SuccessfulPerformanceBroadModeColor {
  return value === 'white' || value === 'black';
}

function isValidRpcCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function zeroBroadModeAggregate(
  mode: RatingModeName,
  color: SuccessfulPerformanceBroadModeColor,
): SuccessfulPerformanceAggregate {
  return {
    scope: 'mode',
    mode,
    color,
    exactControl: null,
    wins: 0,
    draws: 0,
    losses: 0,
    eligibleGames: 0,
    sourceStatus: 'available',
  };
}

function zeroBattlefieldLifetimeAggregate(): SuccessfulPerformanceAggregate {
  return {
    scope: 'battlefield',
    mode: null,
    color: 'combined',
    exactControl: null,
    wins: 0,
    draws: 0,
    losses: 0,
    eligibleGames: 0,
    sourceStatus: 'available',
  };
}

function mapRpcCellToAggregate(
  cell: RpcAggregateCell,
  expected: {
    scope: SuccessfulPerformanceAggregate['scope'];
    mode: RatingModeName | null;
    color: PlayerColor;
  },
): SuccessfulPerformanceAggregate | 'invalid' {
  const sourceStatus = narrowSourceStatus(cell.source_status);
  if (sourceStatus === null) {
    return {
      scope: expected.scope,
      mode: expected.mode,
      color: expected.color,
      exactControl: null,
      wins: 0,
      draws: 0,
      losses: 0,
      eligibleGames: 0,
      sourceStatus: 'unavailable',
    };
  }
  if (sourceStatus === 'unavailable') {
    return {
      scope: expected.scope,
      mode: expected.mode,
      color: expected.color,
      exactControl: null,
      wins: 0,
      draws: 0,
      losses: 0,
      eligibleGames: 0,
      sourceStatus: 'unavailable',
    };
  }

  const wins = cell.wins;
  const draws = cell.draws;
  const losses = cell.losses;
  const eligibleGames = cell.eligible_games ?? cell.games;

  if (
    !isValidRpcCount(wins) ||
    !isValidRpcCount(draws) ||
    !isValidRpcCount(losses) ||
    !isValidRpcCount(eligibleGames)
  ) {
    return 'invalid';
  }
  if (eligibleGames !== wins + draws + losses) {
    return 'invalid';
  }

  return {
    scope: expected.scope,
    mode: expected.mode,
    color: expected.color,
    exactControl: null,
    wins,
    draws,
    losses,
    eligibleGames,
    sourceStatus: 'available',
  };
}

function findBroadModeCell(
  cells: RpcAggregateCell[],
  mode: RatingModeName,
  color: SuccessfulPerformanceBroadModeColor,
): RpcAggregateCell | undefined {
  return cells.find(
    (cell) =>
      cell.scope === 'mode' &&
      cell.mode === mode &&
      cell.color === color &&
      (cell.exact_control == null || cell.exact_control === ''),
  );
}

function findExactControlCell(
  cells: RpcAggregateCell[],
  mode: RatingModeName,
  color: SuccessfulPerformanceBroadModeColor,
  exactControl: string,
): RpcAggregateCell | undefined {
  return cells.find(
    (cell) =>
      cell.scope === 'exact_control' &&
      cell.mode === mode &&
      cell.color === color &&
      cell.exact_control === exactControl,
  );
}

function exactControlEligibleGames(cell: RpcAggregateCell | undefined): number {
  if (!cell) return 0;
  const sourceStatus = narrowSourceStatus(cell.source_status);
  if (sourceStatus !== 'available') return 0;
  const eligibleGames = cell.eligible_games ?? cell.games;
  if (!isValidRpcCount(eligibleGames)) return 0;
  const wins = cell.wins;
  const draws = cell.draws;
  const losses = cell.losses;
  if (
    !isValidRpcCount(wins) ||
    !isValidRpcCount(draws) ||
    !isValidRpcCount(losses) ||
    eligibleGames !== wins + draws + losses
  ) {
    return 0;
  }
  return eligibleGames;
}

function buildExactControlUnlockDescriptors(
  exactControlCells: RpcAggregateCell[],
): Record<RatingModeName, ExactControlUnlockDescriptor[]> {
  const byMode = {} as Record<RatingModeName, ExactControlUnlockDescriptor[]>;

  for (const mode of SUCCESSFUL_PERFORMANCE_BROAD_MODES) {
    const descriptors: ExactControlUnlockDescriptor[] = [];
    for (const color of SUCCESSFUL_PERFORMANCE_BROAD_MODE_COLORS) {
      for (const exactControl of SUCCESSFUL_PERFORMANCE_ROUTE_B_CONTROLS[mode]) {
        const cell = findExactControlCell(exactControlCells, mode, color, exactControl);
        const eligibleGames = exactControlEligibleGames(cell);
        descriptors.push({
          mode,
          color,
          exactControl,
          unlocked: eligibleGames >= 10,
        });
      }
    }
    byMode[mode] = descriptors;
  }

  return byMode;
}

function rpcBroadModeUnlocked(cell: RpcAggregateCell | undefined): boolean | null {
  if (!cell) return false;
  if (typeof cell.unlocked !== 'boolean') return null;
  return cell.unlocked;
}

function computedBroadModeUnlocked(
  aggregate: SuccessfulPerformanceAggregate,
  mode: RatingModeName,
  exactControlUnlocks: ExactControlUnlockDescriptor[],
): boolean {
  const unlockState = resolveBroadModeUnlockState({
    mode,
    color: aggregate.color as SuccessfulPerformanceBroadModeColor,
    eligibleGames: aggregate.eligibleGames,
    sourceStatus: aggregate.sourceStatus,
    requiredExactControls: [...SUCCESSFUL_PERFORMANCE_ROUTE_B_CONTROLS[mode]],
    exactControlUnlocks,
  });
  return unlockState === 'unlocked';
}

function broadModeRpcUnlockConsistent(
  rpcCell: RpcAggregateCell | undefined,
  aggregate: SuccessfulPerformanceAggregate,
  mode: RatingModeName,
  exactControlUnlocks: ExactControlUnlockDescriptor[],
): boolean {
  const rpcUnlocked = rpcBroadModeUnlocked(rpcCell);
  if (rpcUnlocked === null) return true;
  return rpcUnlocked === computedBroadModeUnlocked(aggregate, mode, exactControlUnlocks);
}

/**
 * Adapt the authoritative RPC envelope into the structurally restricted Profile payload.
 * Raw exact-control cells, tournament cells, and the envelope itself are not returned.
 */
export function adaptOwnSuccessfulPerformanceRpc(raw: unknown): OwnSuccessfulPerformanceResult {
  if (!isRecord(raw)) {
    return { status: 'unavailable' };
  }

  const envelope = raw as RpcEnvelope;

  if (envelope.contract_version !== SUCCESSFUL_PERFORMANCE_CONTRACT_VERSION) {
    return { status: 'unavailable' };
  }

  const topSourceStatus = narrowSourceStatus(envelope.source_status);
  if (topSourceStatus !== 'available') {
    return { status: 'unavailable' };
  }

  const freePlay = envelope.free_play;
  if (!isRecord(freePlay)) {
    return { status: 'unavailable' };
  }

  const modeCells = Array.isArray(freePlay.modes) ? freePlay.modes : [];
  const exactControlCells = Array.isArray(freePlay.exact_controls) ? freePlay.exact_controls : [];

  const exactControlUnlocksByMode = buildExactControlUnlockDescriptors(exactControlCells);

  const broadModeAggregates = {} as BroadModeSuccessfulPerformanceAggregates;

  for (const mode of SUCCESSFUL_PERFORMANCE_BROAD_MODES) {
    broadModeAggregates[mode] = {} as Record<
      SuccessfulPerformanceBroadModeColor,
      SuccessfulPerformanceAggregate
    >;

    for (const color of SUCCESSFUL_PERFORMANCE_BROAD_MODE_COLORS) {
      const rpcCell = findBroadModeCell(modeCells, mode, color);
      const mapped = rpcCell
        ? mapRpcCellToAggregate(rpcCell, { scope: 'mode', mode, color })
        : zeroBroadModeAggregate(mode, color);

      if (mapped === 'invalid') {
        return { status: 'invalid', reason: `invalid_broad_mode_cell:${mode}:${color}` };
      }

      const colorUnlocks = exactControlUnlocksByMode[mode].filter((d) => d.color === color);
      if (!broadModeRpcUnlockConsistent(rpcCell, mapped, mode, colorUnlocks)) {
        return {
          status: 'invalid',
          reason: `rpc_unlock_mismatch:${mode}:${color}`,
        };
      }

      broadModeAggregates[mode][color] = mapped;
    }
  }

  const battlefieldSection = envelope.battlefield;
  const lifetimeCell = isRecord(battlefieldSection) ? battlefieldSection.lifetime : undefined;

  let battlefieldLifetime: SuccessfulPerformanceAggregate;
  if (!lifetimeCell) {
    battlefieldLifetime = zeroBattlefieldLifetimeAggregate();
  } else {
    const mapped = mapRpcCellToAggregate(lifetimeCell, {
      scope: 'battlefield',
      mode: null,
      color: 'combined',
    });
    if (mapped === 'invalid') {
      return { status: 'invalid', reason: 'invalid_battlefield_lifetime' };
    }
    battlefieldLifetime = mapped;
  }

  return {
    status: 'loaded',
    broadModeAggregates,
    exactControlUnlocksByMode,
    battlefieldLifetime,
  };
}

function isAuthFailureMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('not_authenticated') || normalized.includes('not authenticated');
}

/**
 * Self-only Successful Performance loader. Never falls back to capped dashboard reads.
 */
export async function loadOwnSuccessfulPerformance(
  supabase: SupabaseClient,
): Promise<OwnSuccessfulPerformanceResult> {
  const { data, error } = await supabase.rpc('get_own_successful_performance');

  if (error) {
    if (isAuthFailureMessage(error.message)) {
      return { status: 'unavailable' };
    }
    return { status: 'unavailable' };
  }

  return adaptOwnSuccessfulPerformanceRpc(data);
}

/** Broad-mode unlock policy for Profile rendering (Route A + frozen Route B evidence). */
export function broadModeUnlockPolicyForMode(
  mode: RatingModeName,
  exactControlUnlocks: ExactControlUnlockDescriptor[],
) {
  return {
    kind: 'broad_mode' as const,
    requiredExactControls: [...SUCCESSFUL_PERFORMANCE_ROUTE_B_CONTROLS[mode]],
    exactControlUnlocks,
  };
}

export function routeASatisfied(
  aggregate: SuccessfulPerformanceAggregate,
  mode: RatingModeName,
): boolean {
  return (
    aggregate.sourceStatus === 'available' &&
    aggregate.eligibleGames >= BROAD_MODE_UNLOCK_THRESHOLD &&
    resolveBroadModeUnlockState({
      mode,
      color: aggregate.color as SuccessfulPerformanceBroadModeColor,
      eligibleGames: aggregate.eligibleGames,
      sourceStatus: aggregate.sourceStatus,
      requiredExactControls: [...SUCCESSFUL_PERFORMANCE_ROUTE_B_CONTROLS[mode]],
      exactControlUnlocks: [],
    }) === 'unlocked'
  );
}

export function routeBSatisfied(
  mode: RatingModeName,
  color: SuccessfulPerformanceBroadModeColor,
  exactControlUnlocks: ExactControlUnlockDescriptor[],
): boolean {
  return broadModeRouteBSatisfied({
    mode,
    color,
    eligibleGames: 1,
    sourceStatus: 'available',
    requiredExactControls: [...SUCCESSFUL_PERFORMANCE_ROUTE_B_CONTROLS[mode]],
    exactControlUnlocks,
  });
}
