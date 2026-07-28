/**
 * Pure helpers for Stage 2 major-family comparison (no synthetic points).
 */

import type { MajorFamilySeriesData } from '@/lib/profileRatingChartLevels';
import { filterPointsByLane, type RatingLane } from '@/lib/ratingHistoryMetrics';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';

export { buildMajorFamilySeriesData, countMajorFamilyInputPoints } from '@/lib/profileRatingChartLevels';

export function filterMajorFamilySeriesByLane(
  series: MajorFamilySeriesData[],
  lane: RatingLane,
  nowMs: number = Date.now(),
): MajorFamilySeriesData[] {
  return series.map((s) => ({
    ...s,
    points: filterPointsByLane(s.points, lane, nowMs),
  }));
}

/** Points that share an exact authoritative timestamp (no cross-family fabrication). */
export function pointsAtExactTimestamp(
  series: MajorFamilySeriesData[],
  occurredAt: string,
  visibleTrackIds: ReadonlySet<string>,
): { trackId: string; label: string; color: string; point: RatingHistoryPoint }[] {
  const out: { trackId: string; label: string; color: string; point: RatingHistoryPoint }[] = [];
  for (const s of series) {
    if (!visibleTrackIds.has(s.trackId)) continue;
    const hit = s.points.find((p) => p.occurredAt === occurredAt);
    if (hit) {
      out.push({ trackId: s.trackId, label: s.label, color: s.color, point: hit });
    }
  }
  return out;
}

export function majorFamilySeriesHasAnyPoints(series: MajorFamilySeriesData[]): boolean {
  return series.some((s) => s.points.length > 0);
}

export function majorFamilyEmptyTrackIds(series: MajorFamilySeriesData[]): string[] {
  return series.filter((s) => s.points.length === 0).map((s) => s.trackId);
}
