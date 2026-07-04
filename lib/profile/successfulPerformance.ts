/**
 * Successful Performance — pure scoring helper (frontend foundation).
 *
 * PURITY CONTRACT: this module imports ONLY its own type contract. It must never
 * import data loaders, Supabase, APIs, game/ledger readers, or Elo settlement.
 * It performs no I/O, no mutation, and never fabricates or repairs values.
 *
 *   successful points = wins + (draws * 0.5)
 *   Successful Performance percentage = successful points / eligible games * 100
 */

import type {
  SuccessfulPerformanceAggregate,
  SuccessfulPerformanceScore,
} from '@/lib/profile/successfulPerformanceTypes';

export const SUCCESSFUL_POINTS_PER_WIN = 1;
export const SUCCESSFUL_POINTS_PER_DRAW = 0.5;
export const SUCCESSFUL_POINTS_PER_LOSS = 0;

/** True only for a finite, non-negative, whole-number count. */
export function isValidGameCount(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

/** Successful points for a win/draw tally. Pure arithmetic; no validation. */
export function successfulPoints(wins: number, draws: number): number {
  return wins * SUCCESSFUL_POINTS_PER_WIN + draws * SUCCESSFUL_POINTS_PER_DRAW;
}

type ScoringInput = Pick<
  SuccessfulPerformanceAggregate,
  'wins' | 'draws' | 'losses' | 'eligibleGames' | 'sourceStatus'
>;

/**
 * Compute the Successful Performance score from an authoritative aggregate.
 *
 * Ordering is deliberate:
 *  1. unavailable authoritative source -> `unavailable` (never 0%)
 *  2. any negative / non-finite / fractional count -> `invalid`
 *  3. eligibleGames !== wins + draws + losses -> `invalid` (no silent repair)
 *  4. zero eligible games -> `insufficient_data` (never 0%)
 *  5. otherwise -> `ok` with points + percentage
 */
export function scoreSuccessfulPerformance(input: ScoringInput): SuccessfulPerformanceScore {
  const { wins, draws, losses, eligibleGames, sourceStatus } = input;

  if (sourceStatus === 'unavailable') {
    return { status: 'unavailable' };
  }

  const checks: ReadonlyArray<readonly [string, number]> = [
    ['wins', wins],
    ['draws', draws],
    ['losses', losses],
    ['eligibleGames', eligibleGames],
  ];
  for (const [name, value] of checks) {
    if (!isValidGameCount(value)) {
      return { status: 'invalid', reason: `${name} must be a finite, non-negative integer` };
    }
  }

  if (eligibleGames !== wins + draws + losses) {
    return {
      status: 'invalid',
      reason: 'eligibleGames must equal wins + draws + losses',
    };
  }

  if (eligibleGames === 0) {
    return { status: 'insufficient_data' };
  }

  const points = successfulPoints(wins, draws);
  const percentage = (points / eligibleGames) * 100;
  return { status: 'ok', successfulPoints: points, percentage, eligibleGames };
}
