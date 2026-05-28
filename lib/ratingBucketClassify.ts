/**
 * Legacy six-bucket pace classification (live | daily | correspondence × play context).
 * Must match public.classify_rating_bucket after 20260619171000; SQL remains source of truth for DB rating apply.
 */

import type { PlayContext, RatingBucket } from '@/lib/ratingBuckets';
import { isRatingBucket } from '@/lib/ratingBuckets';

const DAILY_TEMPO_LC = new Set(['', '1d', '2d', '3d', '5d', '7d', '30m', '60m']);

const CORRESPONDENCE_DAY_LC = new Set(['1d', '2d', '3d']);

const LEGACY_ASYNC_DAY_LC = new Set(['5d', '7d']);

const LIVE_LC = new Set([
  '1m',
  '1+1',
  '2m',
  '2+0',
  '2+1',
  '3m',
  '3+2',
  '5m',
  '5+5',
  '5m+3s',
  '5m+5',
  '10m',
  '15m',
  '20m',
  '30m',
  '60m',
  '',
]);

function normTempo(tempo: string | null | undefined): string {
  return String(tempo ?? '').trim().toLowerCase();
}

/** Mirrors SQL `regexp_replace(lc, '\s+', '', 'g')` after lower/trim. */
function normLc(liveTimeControl: string | null | undefined): string {
  return String(liveTimeControl ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function bucketPrefix(playContextRaw: string | null | undefined): 'free_' | 'tournament_' {
  return String(playContextRaw ?? '').trim().toLowerCase() === 'tournament' ? 'tournament_' : 'free_';
}

function asBucket(pref: 'free_' | 'tournament_', pace: 'live' | 'daily' | 'correspondence'): RatingBucket | null {
  const b = `${pref}${pace}`;
  return isRatingBucket(b) ? b : null;
}

/** Returns full bucket key (e.g. `free_live`) or `null` when time control is invalid for rating. */
export function classifyRatingBucket(
  playContextRaw: string | null | undefined,
  tempoRaw: string | null | undefined,
  liveTimeControlRaw: string | null | undefined,
): RatingBucket | null {
  const pref = bucketPrefix(playContextRaw);
  const t = normTempo(tempoRaw);
  const lc = normLc(liveTimeControlRaw);

  if (t === 'correspondence') {
    return asBucket(pref, 'correspondence');
  }

  if (t === 'daily') {
    if (DAILY_TEMPO_LC.has(lc)) {
      return asBucket(pref, 'daily');
    }
    return null;
  }

  if (CORRESPONDENCE_DAY_LC.has(lc)) {
    return asBucket(pref, 'correspondence');
  }

  if (LEGACY_ASYNC_DAY_LC.has(lc)) {
    return asBucket(pref, 'daily');
  }

  if (t !== '' && t !== 'live') {
    return null;
  }

  if (LIVE_LC.has(lc)) {
    return asBucket(pref, 'live');
  }

  return null;
}

export function classifyRatingBucketForPlayContext(
  playContext: PlayContext,
  tempoRaw: string | null | undefined,
  liveTimeControlRaw: string | null | undefined,
): RatingBucket | null {
  return classifyRatingBucket(playContext, tempoRaw, liveTimeControlRaw);
}
