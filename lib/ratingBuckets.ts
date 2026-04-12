/**
 * ACCL fixed rating buckets: {play_context}_{pace}.
 * Pace axis is constrained to live/daily/correspondence.
 */

export const RATING_BUCKETS = [
  'free_live',
  'free_daily',
  'free_correspondence',
  'tournament_live',
  'tournament_daily',
  'tournament_correspondence',
] as const;

export type RatingBucket = (typeof RATING_BUCKETS)[number];

export type PlayContext = 'free' | 'tournament';

/** Coarse tempo axis used where `live_time_control` is not available. */
export type RatingPace = 'live' | 'daily' | 'correspondence';

export function isRatingBucket(s: string): s is RatingBucket {
  return (RATING_BUCKETS as readonly string[]).includes(s);
}

/**
 * Default bucket for (context, pace) using contract defaults (empty live TC → 5m live, 30m daily, 1d correspondence).
 * Prefer `classifyRatingBucket` when you have `live_time_control`.
 */
export function bucketForPlayContextAndPace(context: PlayContext, pace: RatingPace): RatingBucket {
  if (context === 'tournament') {
    if (pace === 'daily') return 'tournament_daily';
    if (pace === 'correspondence') return 'tournament_correspondence';
    return 'tournament_live';
  }
  if (pace === 'daily') return 'free_daily';
  if (pace === 'correspondence') return 'free_correspondence';
  return 'free_live';
}

export function speedClassFromRatingBucket(bucket: RatingBucket | null): RatingPace | null {
  if (!bucket) return null;
  const m = /^(?:free|tournament)_(live|daily|correspondence)$/.exec(bucket);
  return m ? (m[1] as RatingPace) : null;
}

/** Human-readable debug / admin labels. */
export function ratingBucketDebugLabel(bucket: RatingBucket): string {
  switch (bucket) {
    case 'free_live':
      return 'Free · Live';
    case 'free_daily':
      return 'Free · Daily';
    case 'free_correspondence':
      return 'Free · Correspondence';
    case 'tournament_live':
      return 'Tournament · Live';
    case 'tournament_daily':
      return 'Tournament · Daily';
    case 'tournament_correspondence':
      return 'Tournament · Correspondence';
    default:
      return bucket;
  }
}

/** @deprecated Alias for `RATING_BUCKETS`. */
export const RATING_BUCKETS_NEW = RATING_BUCKETS;

/** @deprecated Same as `RATING_BUCKETS` (no separate legacy set). */
export const RATING_BUCKETS_ACTIVE = RATING_BUCKETS;
