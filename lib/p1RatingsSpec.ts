/**
 * P1 ratings truth — locked product spec (T1 freeze).
 * Source for classifier parity: SQL `classify_p1_rating_bucket`, `lib/p1RatingClassifier.ts`,
 * backfill, and future UI labels.
 *
 * ACCL Rating (display) = Tournament Rating for P1 (same numeric snapshot).
 * Migration strategy: additive storage then cutover (legacy six-bucket rows remain until later phases).
 */

/** DB bucket for unified tournament + ACCL identity (P1). */
export const P1_TOURNAMENT_BUCKET = 'tournament_unified' as const;

/**
 * Calendar / multiday free play (UI label: "Daily"). Not `free_daily` — that key is reserved by legacy six-bucket rows.
 */
export const P1_FREE_DAY_BUCKET = 'free_day' as const;

export const P1_FREE_BUCKETS = [
  'free_bullet',
  'free_blitz',
  'free_rapid',
  P1_FREE_DAY_BUCKET,
] as const;

export type P1FreeRatingBucket = (typeof P1_FREE_BUCKETS)[number];

export type P1RatingBucket = P1FreeRatingBucket | typeof P1_TOURNAMENT_BUCKET;

/** Locked tournament backfill merge (existing `tournament_*` rows only). */
export const P1_TOURNAMENT_BACKFILL_MERGE_SPEC =
  'Tournament Rating (backfill) = games_played-weighted average of tournament_live, tournament_daily, tournament_correspondence; if all three games_played are 0, use max(rating) across those buckets.' as const;
