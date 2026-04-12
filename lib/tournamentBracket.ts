import type { AdvanceWinnerSlot, BracketMatchPlan } from '@/lib/tournamentTypes';

/** Smallest power of 2 ≥ n (n ≥ 1 → ≥ 2 for play). */
export function nextPowerOf2(n: number): number {
  if (n <= 0) return 1;
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * Best-to-worst ordered player ids, padded with null (byes) at the **end** so pairings are:
 * slot i vs slot M-1-i → classic 1 vs N, 2 vs N-1, …
 */
export function buildExtendedBracketSlots(orderedUserIds: string[]): (string | null)[] {
  const m = nextPowerOf2(orderedUserIds.length);
  const ext: (string | null)[] = orderedUserIds.map((id) => id);
  while (ext.length < m) ext.push(null);
  return ext;
}

export function firstRoundPairings(extended: (string | null)[]): Array<[string | null, string | null]> {
  const m = extended.length;
  if (m < 2 || (m & (m - 1)) !== 0) {
    throw new Error('extended length must be a power of 2 >= 2');
  }
  const half = m / 2;
  const pairs: Array<[string | null, string | null]> = [];
  for (let i = 0; i < half; i++) {
    pairs.push([extended[i], extended[m - 1 - i]]);
  }
  return pairs;
}

export function totalRoundsForBracketSize(bracketSize: number): number {
  if (bracketSize < 2) return 0;
  return Math.round(Math.log2(bracketSize));
}

export function computeNextLink(
  roundNumber: number,
  matchNumber: number,
  totalRounds: number
): {
  nextRound: number | null;
  nextMatchNumber: number | null;
  advanceWinnerAs: AdvanceWinnerSlot | null;
} {
  if (roundNumber >= totalRounds || roundNumber < 1) {
    return { nextRound: null, nextMatchNumber: null, advanceWinnerAs: null };
  }
  return {
    nextRound: roundNumber + 1,
    nextMatchNumber: Math.floor(matchNumber / 2),
    advanceWinnerAs: matchNumber % 2 === 0 ? 'player1' : 'player2',
  };
}

/**
 * Full single-elimination plan: round 1 has real pairings; later rounds empty slots.
 * `orderedUserIds` = best (seed 1) first, worst last.
 */
export function planSingleEliminationBracket(orderedUserIds: string[]): BracketMatchPlan[] {
  if (orderedUserIds.length < 2) {
    throw new Error('need at least 2 participants');
  }
  const ext = buildExtendedBracketSlots(orderedUserIds);
  const m = ext.length;
  const totalRounds = totalRoundsForBracketSize(m);
  const plans: BracketMatchPlan[] = [];

  const r1 = firstRoundPairings(ext);
  r1.forEach((pair, idx) => {
    const link = computeNextLink(1, idx, totalRounds);
    plans.push({
      roundNumber: 1,
      matchNumber: idx,
      player1Id: pair[0],
      player2Id: pair[1],
      nextRound: link.nextRound,
      nextMatchNumber: link.nextMatchNumber,
      advanceWinnerAs: link.advanceWinnerAs,
    });
  });

  for (let r = 2; r <= totalRounds; r++) {
    const count = m / 2 ** r;
    for (let idx = 0; idx < count; idx++) {
      const link = computeNextLink(r, idx, totalRounds);
      plans.push({
        roundNumber: r,
        matchNumber: idx,
        player1Id: null,
        player2Id: null,
        nextRound: link.nextRound,
        nextMatchNumber: link.nextMatchNumber,
        advanceWinnerAs: link.advanceWinnerAs,
      });
    }
  }

  return plans;
}

export function matchKey(roundNumber: number, matchNumber: number): string {
  return `${roundNumber}:${matchNumber}`;
}

/** First round has index 0..(m/2)-1; bracketSize = 2 * (R1 count). */
export function getBracketSizeFromPlans(plans: BracketMatchPlan[]): number {
  const r1 = plans.filter((p) => p.roundNumber === 1);
  return r1.length * 2;
}

/** Final match: highest round, match_number 0. */
export function isFinalMatch(plan: BracketMatchPlan, totalRounds: number): boolean {
  return plan.roundNumber === totalRounds && plan.matchNumber === 0;
}
