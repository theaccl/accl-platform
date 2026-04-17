/**
 * P1 rating bucket classification — must match SQL `classify_p1_rating_bucket`.
 * Legacy `classifyRatingBucket` (six-bucket pace model) is unchanged until cutover.
 */

import {
  P1_FREE_DAY_BUCKET,
  P1_TOURNAMENT_BUCKET,
  type P1RatingBucket,
} from '@/lib/p1RatingsSpec';

function norm(s: string | null | undefined): string {
  return String(s ?? '').trim().toLowerCase();
}

/** Parse "Nm" → minutes, or null. */
function parseSimpleMinutes(lc: string): number | null {
  const m = /^(\d+)m$/.exec(lc);
  return m ? Number(m[1]) : null;
}

/** Parse "a+b" increment controls; returns [a,b] or null. */
function parseIncrement(lc: string): [number, number] | null {
  const m = /^(\d+)\s*\+\s*(\d+)$/.exec(lc);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

/**
 * Maps finished-game style inputs to P1 storage buckets.
 * Returns null when the time control cannot be classified.
 */
export function classifyP1RatingBucket(
  playContextRaw: string | null | undefined,
  tempoRaw: string | null | undefined,
  liveTimeControlRaw: string | null | undefined
): P1RatingBucket | null {
  const pc = norm(playContextRaw);
  if (pc === 'tournament') {
    return P1_TOURNAMENT_BUCKET;
  }

  const t = norm(tempoRaw);
  const lc = norm(liveTimeControlRaw);

  if (t === 'correspondence') {
    return P1_FREE_DAY_BUCKET;
  }
  if (lc === '1d' || lc === '2d' || lc === '3d') {
    return P1_FREE_DAY_BUCKET;
  }

  const inc = parseIncrement(lc);
  if (inc) {
    const [a, b] = inc;
    if (a === 1 && b === 1) return 'free_bullet';
    if (a === 2 && b === 1) return 'free_bullet';
    if (a === 3 && b === 2) return 'free_blitz';
    if (a === 5 && b === 5) return 'free_blitz';
    return null;
  }

  const mins = parseSimpleMinutes(lc);
  if (mins !== null) {
    if (mins === 1) return 'free_bullet';
    if (mins === 3 || mins === 5) return 'free_blitz';
    if (mins === 10 || mins === 15 || mins === 20 || mins === 30 || mins === 60) return 'free_rapid';
    return null;
  }

  if (t === 'daily') {
    if (lc === '30m' || lc === '60m') return 'free_rapid';
    if (lc === '1d' || lc === '2d' || lc === '3d') return P1_FREE_DAY_BUCKET;
    return null;
  }

  if (t !== '' && t !== 'live') {
    return null;
  }

  if (lc === '') {
    return 'free_blitz';
  }

  return null;
}
