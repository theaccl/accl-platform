/**
 * Frozen bucket classification (fixed pace model: live/daily/correspondence).
 */

import type { PlayContext, RatingBucket } from '@/lib/ratingBuckets';
import { isRatingBucket } from '@/lib/ratingBuckets';

function normTempo(tempo: string | null | undefined): string {
  return String(tempo ?? '').trim().toLowerCase();
}

function normLc(liveTimeControl: string | null | undefined): string {
  return String(liveTimeControl ?? '').trim().toLowerCase();
}

function bucketPrefix(playContextRaw: string | null | undefined): 'free_' | 'tournament_' {
  return String(playContextRaw ?? '').trim().toLowerCase() === 'tournament' ? 'tournament_' : 'free_';
}

/** Returns full bucket key (e.g. `free_live`) or `null` when time control is invalid for rating. */
export function classifyRatingBucket(
  playContextRaw: string | null | undefined,
  tempoRaw: string | null | undefined,
  liveTimeControlRaw: string | null | undefined
): RatingBucket | null {
  const pref = bucketPrefix(playContextRaw);
  let t = normTempo(tempoRaw);
  let lc = normLc(liveTimeControlRaw);

  if (lc.includes('+')) return null;

  if (t === 'correspondence' || lc === '1d' || lc === '2d' || lc === '3d') {
    const b = `${pref}correspondence`;
    return isRatingBucket(b) ? b : null;
  }

  if (t === 'daily') {
    if (lc !== '' && lc !== '30m' && lc !== '60m') return null;
    const b = `${pref}daily`;
    return isRatingBucket(b) ? b : null;
  }

  if (t !== '' && t !== 'live') return null;
  if (lc !== '' && !/^(1m|3m|5m|10m|30m|60m)$/.test(lc)) return null;

  const b = `${pref}live`;
  return isRatingBucket(b) ? b : null;
}

export function classifyRatingBucketForPlayContext(
  playContext: PlayContext,
  tempoRaw: string | null | undefined,
  liveTimeControlRaw: string | null | undefined
): RatingBucket | null {
  return classifyRatingBucket(playContext, tempoRaw, liveTimeControlRaw);
}
