/**
 * P1 public read helpers — align UI with get_public_profile_snapshot.p1 + legacy fallbacks.
 */

import { classifyP1RatingBucket } from '@/lib/p1RatingClassifier';
import type { P1RatingBucket } from '@/lib/p1RatingsSpec';
import { P1_TOURNAMENT_BUCKET } from '@/lib/p1RatingsSpec';

/** Matches RPC `get_public_profile_snapshot` → `p1` object. */
export type PublicP1Read = {
  accl_rating: number | null;
  tournament_rating: number | null;
  tournament_unified: { rating: number; games_played: number } | null;
  free_bullet: { rating: number; games_played: number } | null;
  free_blitz: { rating: number; games_played: number } | null;
  free_rapid: { rating: number; games_played: number } | null;
  free_day: { rating: number; games_played: number } | null;
};

export function parseP1FromSnapshotPayload(data: unknown): PublicP1Read | null {
  if (!data || typeof data !== 'object') return null;
  const p1 = (data as { p1?: unknown }).p1;
  if (!p1 || typeof p1 !== 'object') return null;
  return p1 as PublicP1Read;
}

function rowRating(row: { rating: number; games_played: number } | null | undefined): number | null {
  if (!row || typeof row.rating !== 'number' || !Number.isFinite(row.rating)) return null;
  return row.rating;
}

/** Identity headline: P1 ACCL (tournament_unified) when present, else legacy profiles.rating. */
export function acclRatingFromP1(
  p1: PublicP1Read | null | undefined,
  legacyProfileRating: number | null | undefined,
): number | null {
  if (p1 && typeof p1.accl_rating === 'number' && Number.isFinite(p1.accl_rating)) {
    return p1.accl_rating;
  }
  if (typeof legacyProfileRating === 'number' && Number.isFinite(legacyProfileRating)) {
    return legacyProfileRating;
  }
  return rowRating(p1?.tournament_unified ?? null);
}

export function formatRatingDisplay(n: number | null | undefined): string {
  if (typeof n === 'number' && Number.isFinite(n)) return String(Math.round(n));
  return '—';
}

function p1BucketRow(
  p1: PublicP1Read | null | undefined,
  bucket: P1RatingBucket,
): { rating: number; games_played: number } | null {
  if (!p1) return null;
  if (bucket === P1_TOURNAMENT_BUCKET) return p1.tournament_unified;
  const k = bucket as keyof PublicP1Read;
  const row = p1[k];
  if (!row || typeof row !== 'object' || typeof (row as { rating?: unknown }).rating !== 'number') {
    return null;
  }
  return row as { rating: number; games_played: number };
}

/**
 * Mode-specific display rating for a game/challenge: P1 row for classified bucket, then ACCL, then legacy.
 */
export function modeRatingFromP1Context(
  p1: PublicP1Read | null | undefined,
  playContext: string | null | undefined,
  tempo: string | null | undefined,
  liveTimeControl: string | null | undefined,
  legacyProfileRating: number | null | undefined,
): number | null {
  const bucket = classifyP1RatingBucket(playContext, tempo, liveTimeControl);
  if (bucket) {
    const r = rowRating(p1BucketRow(p1, bucket));
    if (r != null) return r;
  }
  return acclRatingFromP1(p1, legacyProfileRating);
}

/** Map player_ratings rows (bucket → rating) for live display without full snapshot. */
export function ratingFromPlayerRatingsMap(
  byUser: Map<string, Map<string, number>> | undefined,
  userId: string,
  playContext: string | null | undefined,
  tempo: string | null | undefined,
  liveTimeControl: string | null | undefined,
  legacyProfileRating: number | null | undefined,
): number | null {
  const bucket = classifyP1RatingBucket(playContext, tempo, liveTimeControl);
  const uid = String(userId ?? '').trim();
  if (!uid || !bucket || !byUser) {
    return typeof legacyProfileRating === 'number' && Number.isFinite(legacyProfileRating)
      ? legacyProfileRating
      : null;
  }
  const m = byUser.get(uid);
  const r = m?.get(bucket);
  if (typeof r === 'number' && Number.isFinite(r)) return r;
  const tu = m?.get('tournament_unified');
  if (typeof tu === 'number' && Number.isFinite(tu)) return tu;
  return typeof legacyProfileRating === 'number' && Number.isFinite(legacyProfileRating)
    ? legacyProfileRating
    : null;
}
