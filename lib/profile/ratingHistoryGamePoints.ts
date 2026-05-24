import type {
  RatingBucketView,
  RatingGamePointSnapshot,
  RatingHistorySeries,
} from '@/lib/profile/ratingDashboardTypes';

const REQUIRED_SNAPSHOT_KEYS: (keyof RatingGamePointSnapshot)[] = [
  'gameId',
  'finishedAt',
  'ratingBucket',
  'mode',
  'timeControl',
  'opponentUsername',
  'opponentRating',
  'result',
  'ratingBefore',
  'ratingAfter',
  'ratingDelta',
];

/** Type guard — every chart point must satisfy this before interactivity is enabled. */
export function isRatingGamePointSnapshot(value: unknown): value is RatingGamePointSnapshot {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  for (const key of REQUIRED_SNAPSHOT_KEYS) {
    if (!(key in row)) return false;
  }
  if (typeof row.gameId !== 'string' || !row.gameId.trim()) return false;
  if (typeof row.finishedAt !== 'string' || !row.finishedAt.trim()) return false;
  if (typeof row.ratingBucket !== 'string' || !row.ratingBucket.trim()) return false;
  if (typeof row.mode !== 'string') return false;
  if (row.timeControl !== null && typeof row.timeControl !== 'string') return false;
  if (row.opponentUsername !== null && typeof row.opponentUsername !== 'string') return false;
  if (row.opponentRating !== null && typeof row.opponentRating !== 'number') return false;
  if (row.result !== 'win' && row.result !== 'loss' && row.result !== 'draw') return false;
  if (typeof row.ratingBefore !== 'number' || !Number.isFinite(row.ratingBefore)) return false;
  if (typeof row.ratingAfter !== 'number' || !Number.isFinite(row.ratingAfter)) return false;
  if (typeof row.ratingDelta !== 'number' || !Number.isFinite(row.ratingDelta)) return false;
  if (row.ratingDelta !== row.ratingAfter - row.ratingBefore) return false;
  return true;
}

/** True when bucket history is a non-empty authoritative game-by-game series. */
export function bucketHasAuthoritativeRatingHistory(bucket: RatingBucketView): boolean {
  const history = bucket.history;
  if (!Array.isArray(history) || history.length === 0) return false;
  return history.every(isRatingGamePointSnapshot);
}

/** Minimum points to draw a movement line (two finished games). */
export function hasEnoughRatingChartPoints(points: RatingGamePointSnapshot[]): boolean {
  return points.length >= 2;
}

export function sortGamePointsChronologically(
  points: RatingGamePointSnapshot[],
): RatingGamePointSnapshot[] {
  return [...points].sort((a, b) => {
    const ta = Date.parse(a.finishedAt);
    const tb = Date.parse(b.finishedAt);
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
    return a.gameId.localeCompare(b.gameId);
  });
}

export function toRatingHistorySeries(
  bucketId: string,
  points: RatingGamePointSnapshot[],
): RatingHistorySeries | null {
  const sorted = sortGamePointsChronologically(points);
  if (!sorted.every(isRatingGamePointSnapshot)) return null;
  return { bucketId, points: sorted };
}

/** Future expanded ticker route — one dedicated page per bucket. */
export function ratingTickerPath(profileId: string, bucketId: string): string {
  const id = encodeURIComponent(profileId.trim());
  const bucket = encodeURIComponent(bucketId.trim());
  return `/profile/${id}/ratings/${bucket}/ticker`;
}

/** Finished game replay route for a chart point click target. */
export function ratingGamePointHref(gameId: string): string {
  return `/game/${encodeURIComponent(gameId.trim())}`;
}
