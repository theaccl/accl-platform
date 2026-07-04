/**
 * Successful Performance — pure unlock resolution (frontend foundation).
 *
 * PURITY CONTRACT: imports only the scoring helper and the type contract. No
 * data loaders, Supabase, APIs, game/ledger readers, or Elo settlement.
 *
 * Unlock doctrine:
 *  - Exact-control color battery unlocks at 10 eligible completed games for that
 *    exact control AND color.
 *  - Broad-mode color battery unlocks by EITHER
 *      Route A: authoritative color sample count for the mode >= 100, OR
 *      Route B: every required exact control in that mode is unlocked for that color.
 *  - White and Black counts are always separate.
 *  - One exact control never unlocks another; a different mode/color never counts.
 *  - Battlefield lifetime and specific-tournament overalls are no-threshold scopes.
 */

import { isValidGameCount, scoreSuccessfulPerformance } from '@/lib/profile/successfulPerformance';
import type {
  ExactControlUnlockDescriptor,
  PlayerColor,
  RatingModeName,
  SuccessfulPerformanceAggregate,
  SuccessfulPerformanceScore,
  SuccessfulPerformanceState,
  SuccessfulPerformanceView,
} from '@/lib/profile/successfulPerformanceTypes';

export const EXACT_CONTROL_UNLOCK_THRESHOLD = 10;
export const BROAD_MODE_UNLOCK_THRESHOLD = 100;

export type ExactControlUnlockInput = {
  mode: RatingModeName;
  color: PlayerColor;
  exactControl: string;
  /**
   * Authoritative eligible completed games for this exact control AND color.
   * This is the sole population count (== wins + draws + losses for this identity);
   * there is no separate sample count.
   */
  eligibleGames: number;
  sourceStatus: 'available' | 'unavailable';
};

/**
 * Exact-control color battery unlock state.
 * unavailable | invalid | unlocked (>=10) | progress (1..9) | locked (0).
 * Isolation is inherent: this only ever sees its own control+color count.
 */
export function resolveExactControlUnlockState(
  input: ExactControlUnlockInput,
): SuccessfulPerformanceState {
  if (input.sourceStatus === 'unavailable') return 'unavailable';
  if (!isValidGameCount(input.eligibleGames)) return 'invalid';
  if (input.eligibleGames >= EXACT_CONTROL_UNLOCK_THRESHOLD) return 'unlocked';
  if (input.eligibleGames === 0) return 'locked';
  return 'progress';
}

export type BroadModeUnlockInput = {
  mode: RatingModeName;
  color: PlayerColor;
  /**
   * Authoritative eligible completed games for this mode AND color.
   * This is the sole population count (== wins + draws + losses for this identity);
   * there is no separate sample count.
   */
  eligibleGames: number;
  sourceStatus: 'available' | 'unavailable';
  /** Exact controls that must all be unlocked for Route B (authoritative for this mode). */
  requiredExactControls: string[];
  /** Known exact-control unlock facts (any mode/color; mismatches are ignored). */
  exactControlUnlocks: ExactControlUnlockDescriptor[];
};

/**
 * Route B: every required exact control is unlocked for THIS mode and color.
 * Descriptors for another mode or another color are ignored (cannot satisfy).
 */
export function broadModeRouteBSatisfied(input: BroadModeUnlockInput): boolean {
  const required = input.requiredExactControls;
  if (!Array.isArray(required) || required.length === 0) return false;
  const matching = input.exactControlUnlocks.filter(
    (d) => d.mode === input.mode && d.color === input.color,
  );
  return required.every((control) =>
    matching.some((d) => d.exactControl === control && d.unlocked === true),
  );
}

/**
 * Broad-mode color battery unlock state.
 * unavailable | invalid | unlocked (Route A >=100 or Route B with eligibleGames > 0) | progress (1..99) | locked (0).
 */
export function resolveBroadModeUnlockState(
  input: BroadModeUnlockInput,
): SuccessfulPerformanceState {
  if (input.sourceStatus === 'unavailable') return 'unavailable';
  if (!isValidGameCount(input.eligibleGames)) return 'invalid';
  if (input.eligibleGames >= BROAD_MODE_UNLOCK_THRESHOLD) return 'unlocked';
  if (input.eligibleGames === 0) return 'locked';
  if (broadModeRouteBSatisfied(input)) return 'unlocked';
  return 'progress';
}

/** Data-availability outcome for authorized no-threshold scopes (battlefield/tournament). */
function resolveNoThresholdState(score: SuccessfulPerformanceScore): SuccessfulPerformanceState {
  if (score.status === 'unavailable') return 'unavailable';
  if (score.status === 'invalid') return 'invalid';
  if (score.status === 'insufficient_data') return 'insufficient_data';
  return 'unlocked';
}

/** Policy that drives which unlock rule applies. Supplied by the authoritative caller. */
export type SuccessfulPerformanceUnlockPolicy =
  | { kind: 'exact_control' }
  | {
      kind: 'broad_mode';
      requiredExactControls: string[];
      exactControlUnlocks: ExactControlUnlockDescriptor[];
    }
  | { kind: 'no_threshold' };

/**
 * Reconcile the unlock state with the scoring outcome so that data problems
 * always dominate: unavailable > invalid > (locked | progress | unlocked | insufficient_data).
 *
 * A battery may only present as `unlocked` when it has a valid authoritative score
 * (score === ok, which requires eligibleGames > 0 and a consistent W/D/L split).
 * This makes an "unlocked with zero games" state impossible by construction, even
 * for the broad-mode Route B path.
 */
function reconcile(
  unlockState: SuccessfulPerformanceState,
  score: SuccessfulPerformanceScore,
): SuccessfulPerformanceState {
  if (score.status === 'unavailable' || unlockState === 'unavailable') return 'unavailable';
  if (score.status === 'invalid' || unlockState === 'invalid') return 'invalid';
  if (unlockState === 'unlocked' && score.status !== 'ok') return 'insufficient_data';
  return unlockState;
}

function isNonEmptyExactControl(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isExactControlIdentityValid(aggregate: SuccessfulPerformanceAggregate): boolean {
  return (
    aggregate.scope === 'exact_control' &&
    aggregate.mode != null &&
    isNonEmptyExactControl(aggregate.exactControl) &&
    aggregate.color !== 'combined'
  );
}

function isBroadModeIdentityValid(aggregate: SuccessfulPerformanceAggregate): boolean {
  return aggregate.scope === 'mode' && aggregate.mode != null && aggregate.color !== 'combined';
}

function isNoThresholdScopeValid(aggregate: SuccessfulPerformanceAggregate): boolean {
  return aggregate.scope === 'battlefield' || aggregate.scope === 'tournament';
}

/**
 * Resolve a full presentational view model from an authoritative aggregate and a
 * unlock policy. The percentage is suppressed unless BOTH:
 *   - the battery is unlocked (threshold met) or a no-threshold authorized scope, AND
 *   - authoritative W/D/L data is available and valid (scoring == ok).
 */
export function resolveSuccessfulPerformanceView(
  aggregate: SuccessfulPerformanceAggregate,
  policy: SuccessfulPerformanceUnlockPolicy,
): SuccessfulPerformanceView {
  const score = scoreSuccessfulPerformance(aggregate);

  let unlockState: SuccessfulPerformanceState;
  let threshold: number | null = null;
  let progressCount: number | null = null;

  if (policy.kind === 'exact_control') {
    threshold = EXACT_CONTROL_UNLOCK_THRESHOLD;
    progressCount = isValidGameCount(aggregate.eligibleGames) ? aggregate.eligibleGames : null;
    if (!isExactControlIdentityValid(aggregate)) {
      unlockState = 'invalid';
    } else {
      unlockState = resolveExactControlUnlockState({
        mode: aggregate.mode as RatingModeName,
        color: aggregate.color,
        exactControl: aggregate.exactControl as string,
        eligibleGames: aggregate.eligibleGames,
        sourceStatus: aggregate.sourceStatus,
      });
    }
  } else if (policy.kind === 'broad_mode') {
    threshold = BROAD_MODE_UNLOCK_THRESHOLD;
    progressCount = isValidGameCount(aggregate.eligibleGames) ? aggregate.eligibleGames : null;
    if (!isBroadModeIdentityValid(aggregate)) {
      unlockState = 'invalid';
    } else {
      unlockState = resolveBroadModeUnlockState({
        mode: aggregate.mode as RatingModeName,
        color: aggregate.color,
        eligibleGames: aggregate.eligibleGames,
        sourceStatus: aggregate.sourceStatus,
        requiredExactControls: policy.requiredExactControls,
        exactControlUnlocks: policy.exactControlUnlocks,
      });
    }
  } else {
    threshold = null;
    progressCount = null;
    if (!isNoThresholdScopeValid(aggregate)) {
      unlockState = 'invalid';
    } else {
      unlockState = resolveNoThresholdState(score);
    }
  }

  const state = reconcile(unlockState, score);
  const showPercentage = state === 'unlocked' && score.status === 'ok';

  return {
    scope: aggregate.scope,
    mode: aggregate.mode ?? null,
    color: aggregate.color,
    exactControl: aggregate.exactControl ?? null,
    state,
    threshold,
    progressCount,
    percentage: showPercentage ? score.percentage : null,
    successfulPoints: showPercentage ? score.successfulPoints : null,
    eligibleGames: score.status === 'ok' ? score.eligibleGames : null,
    invalidReason:
      score.status === 'invalid'
        ? score.reason
        : state === 'invalid'
          ? 'invalid unlock input'
          : null,
  };
}
