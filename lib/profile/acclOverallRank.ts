/**
 * ACCL Overall Rank — display-only rating→tier mapping for the ACCL Overall lane.
 *
 * This module is intentionally isolated and pure:
 *  - It maps an already-resolved ACCL Overall rating to a player-facing tier label.
 *  - It is NOT the free-play exact-control badge system. It has no relationship to
 *    `player_badge_state`, `BADGE_RANK_BANDS`, `rankBandFromSettlementRating`, badge
 *    promotion/demotion, or Nexus `titleAssignment` competitive titles.
 *  - It performs no rating math, no settlement, no persistence, and no data access.
 *
 * Boundaries are lower-inclusive and upper-inclusive; the top tier is open-ended.
 * Do NOT import `badgeTracks`, `badgeSettlement`, `titleAssignment`, Supabase, or API code here.
 */

export const ACCL_OVERALL_RANK_FLOOR = 600;

export type AcclOverallRankTierId =
  | 'f'
  | 'e'
  | 'd'
  | 'c'
  | 'b'
  | 'a'
  | 'expert'
  | 'battle_master'
  | 'high_master'
  | 'apex_master'
  | 'sovereign_master'
  | 'platinum_sovereign'
  | 'diamond_sovereign'
  | 'eternal_sovereign'
  | 'sovereign_eternal';

export type AcclOverallRankTier = {
  id: AcclOverallRankTierId;
  label: string;
  /** Inclusive lower bound. */
  lowerBound: number;
  /** Inclusive upper bound, or null for the open-ended top tier. */
  upperBound: number | null;
};

/**
 * Locked ACCL Overall Rank ladder (ascending). Contiguous, lower- and upper-inclusive.
 * `sovereign_eternal` is open-ended (upperBound = null).
 */
export const ACCL_OVERALL_RANK_TIERS: readonly AcclOverallRankTier[] = [
  { id: 'f', label: 'F', lowerBound: 600, upperBound: 999 },
  { id: 'e', label: 'E', lowerBound: 1000, upperBound: 1199 },
  { id: 'd', label: 'D', lowerBound: 1200, upperBound: 1399 },
  { id: 'c', label: 'C', lowerBound: 1400, upperBound: 1599 },
  { id: 'b', label: 'B', lowerBound: 1600, upperBound: 1799 },
  { id: 'a', label: 'A', lowerBound: 1800, upperBound: 1999 },
  { id: 'expert', label: 'Expert', lowerBound: 2000, upperBound: 2199 },
  { id: 'battle_master', label: 'Battle Master', lowerBound: 2200, upperBound: 2399 },
  { id: 'high_master', label: 'High Master', lowerBound: 2400, upperBound: 2599 },
  { id: 'apex_master', label: 'Apex Master', lowerBound: 2600, upperBound: 2799 },
  { id: 'sovereign_master', label: 'Sovereign Master', lowerBound: 2800, upperBound: 2999 },
  { id: 'platinum_sovereign', label: 'Platinum Sovereign', lowerBound: 3000, upperBound: 3199 },
  { id: 'diamond_sovereign', label: 'Diamond Sovereign', lowerBound: 3200, upperBound: 3399 },
  { id: 'eternal_sovereign', label: 'Eternal Sovereign', lowerBound: 3400, upperBound: 3599 },
  { id: 'sovereign_eternal', label: 'Sovereign Eternal', lowerBound: 3600, upperBound: null },
] as const;

/** Shown when a rating is present but below the ladder floor (< 600). */
export const ACCL_OVERALL_RANK_UNRANKED_LABEL = 'Unranked';

export type AcclOverallRankResult =
  | { status: 'ranked'; rating: number; tier: AcclOverallRankTier }
  /** Rating is a finite number below {@link ACCL_OVERALL_RANK_FLOOR}. */
  | { status: 'below_ladder'; rating: number }
  /** Rating is null/undefined/non-finite (unavailable). */
  | { status: 'unavailable' };

/**
 * Classify an ACCL Overall rating into its rank tier.
 *
 * Fractional policy: authoritative ACCL Overall ratings are integers, so an integer
 * input is used as-is. For an unexpected finite fractional value we `Math.floor` (truncate
 * toward the lower tier) — never `Math.round`/ceil — so a fraction can never promote a
 * player early across a locked boundary (e.g. 2399.6 stays Battle Master, not High Master).
 * Non-finite / null / undefined inputs are `unavailable`.
 */
export function acclOverallRankForRating(
  rating: number | null | undefined,
): AcclOverallRankResult {
  if (typeof rating !== 'number' || !Number.isFinite(rating)) {
    return { status: 'unavailable' };
  }
  const r = Math.floor(rating);
  if (r < ACCL_OVERALL_RANK_FLOOR) {
    return { status: 'below_ladder', rating: r };
  }
  for (let i = ACCL_OVERALL_RANK_TIERS.length - 1; i >= 0; i -= 1) {
    const tier = ACCL_OVERALL_RANK_TIERS[i];
    if (r >= tier.lowerBound && (tier.upperBound === null || r <= tier.upperBound)) {
      return { status: 'ranked', rating: r, tier };
    }
  }
  // Unreachable for r >= floor given contiguous tiers; treat defensively as below-ladder.
  return { status: 'below_ladder', rating: r };
}

/**
 * Player-facing rank label for display.
 * Returns the tier label, {@link ACCL_OVERALL_RANK_UNRANKED_LABEL} when below the floor,
 * or null when the rating is unavailable (caller should render nothing).
 */
export function acclOverallRankDisplayLabel(
  rating: number | null | undefined,
): string | null {
  const result = acclOverallRankForRating(rating);
  if (result.status === 'ranked') return result.tier.label;
  if (result.status === 'below_ladder') return ACCL_OVERALL_RANK_UNRANKED_LABEL;
  return null;
}

/**
 * Lane-scoped label helper: only the ACCL Overall lane (`accl`) receives an ACCL
 * Overall Rank label. All other lanes (tournament, free_bullet, free_blitz,
 * free_rapid, free_day) return null so the label can never leak onto them.
 */
export function acclOverallRankLabelForLane(
  laneId: string,
  rating: number | null | undefined,
): string | null {
  if (laneId !== 'accl') return null;
  return acclOverallRankDisplayLabel(rating);
}
