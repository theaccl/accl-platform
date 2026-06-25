/**
 * Standard Elo rating movement for ACCL free-play settlement.
 *
 * This is the canonical TS mirror of the SQL implemented in the
 * `*_free_play_true_elo_rating` migration. Official rating movement is
 * deterministic, auditable, and testable — it comes ONLY from the standard
 * Elo expected-score formula below. No bonuses, multipliers, streak/style/AI
 * modifiers, or homemade formulas are permitted in official rating settlement.
 *
 *   ExpectedScoreA = 1 / (1 + 10 ^ ((RatingB - RatingA) / 400))
 *   DeltaA         = round(K * (ScoreA - ExpectedScoreA))
 *
 * Rounding MUST match Postgres `round(numeric)` (half away from zero) so TS and
 * SQL never drift. See `roundHalfAwayFromZero`.
 */

export const ELO_DENOMINATOR = 400;
export const STARTING_RATING = 1000;
export const RATING_FLOOR = 100;
export const RATING_CEILING = 4000;

export type EloGameScore = 0 | 0.5 | 1;

export type EloResultSide = 'win' | 'draw' | 'loss';

/**
 * Half-away-from-zero rounding to match Postgres `round(numeric)`.
 * (JS `Math.round` rounds half toward +Infinity, which breaks zero-sum at .5.)
 */
export function roundHalfAwayFromZero(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/** Expected score for player A vs player B (standard Elo logistic). */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / ELO_DENOMINATOR));
}

export function scoreFromResultSide(side: EloResultSide): EloGameScore {
  if (side === 'win') return 1;
  if (side === 'loss') return 0;
  return 0.5;
}

/**
 * K-factor schedule (standard Elo-style, calibration only).
 * Very new (<8) = 40, provisional (8–25) = 32, established (>=26) = 20.
 * No high-rated, streak, style, AI, or bot K in this slice.
 */
export function kFactorForGamesPlayed(gamesPlayed: number): number {
  const n = Number.isFinite(gamesPlayed) ? Math.max(0, Math.floor(gamesPlayed)) : 0;
  if (n < 8) return 40;
  if (n < 26) return 32;
  return 20;
}

/** Raw (pre-clamp) Elo delta for the player given own/opponent rating + score + K. */
export function eloDelta(
  ratingSelf: number,
  ratingOpponent: number,
  score: EloGameScore,
  kFactor: number,
): number {
  const expected = expectedScore(ratingSelf, ratingOpponent);
  return roundHalfAwayFromZero(kFactor * (score - expected));
}

/** Clamp a resulting rating into [RATING_FLOOR, RATING_CEILING]. */
export function clampRating(rating: number): number {
  return Math.min(RATING_CEILING, Math.max(RATING_FLOOR, Math.round(rating)));
}

export type EloSideOutcome = {
  ratingBefore: number;
  kFactor: number;
  expected: number;
  deltaRaw: number;
  ratingAfter: number;
  deltaClamped: number;
};

/**
 * Full deterministic per-side outcome for one finished game, including the
 * clamped result. `deltaClamped` may differ from `deltaRaw` only at the
 * floor/ceiling boundary.
 */
export function computeEloOutcome(input: {
  ratingSelf: number;
  ratingOpponent: number;
  side: EloResultSide;
  gamesPlayedSelf: number;
}): EloSideOutcome {
  const k = kFactorForGamesPlayed(input.gamesPlayedSelf);
  const expected = expectedScore(input.ratingSelf, input.ratingOpponent);
  const score = scoreFromResultSide(input.side);
  const deltaRaw = roundHalfAwayFromZero(k * (score - expected));
  const ratingAfter = clampRating(input.ratingSelf + deltaRaw);
  return {
    ratingBefore: input.ratingSelf,
    kFactor: k,
    expected,
    deltaRaw,
    ratingAfter,
    deltaClamped: ratingAfter - input.ratingSelf,
  };
}
