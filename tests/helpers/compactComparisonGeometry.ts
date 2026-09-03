/**
 * Independent compact-chart geometry for crossing tests.
 * Duplicates MultiLineRatingTickerChart axis math so tests prove it did not change.
 */
import {
  LANDSCAPE_TICKER_CROSSING_HISTORY,
  type CrossingHit,
} from './landscapeTickerCrossingFixture';

/** Must stay equal to MultiLineRatingTickerChart compact viewBox constants. */
export const COMPACT_COMPARISON_CHART = {
  width: 560,
  height: 180,
  pad: 30,
  topAxisBand: 34,
} as const;

export function compactComparisonDomain(trackIds: readonly string[]): {
  minT: number;
  maxT: number;
  minR: number;
  maxR: number;
  yMin: number;
  yMax: number;
} {
  const points = trackIds.flatMap((id) => LANDSCAPE_TICKER_CROSSING_HISTORY[id] ?? []);
  const times = points.map((p) => Date.parse(p.occurredAt)).filter((t) => Number.isFinite(t));
  const ratings = points.map((p) => p.ratingAfter);
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const minR = Math.min(...ratings);
  const maxR = Math.max(...ratings);
  const span = Math.max(maxR - minR, 40);
  return {
    minT,
    maxT,
    minR,
    maxR,
    yMin: minR - span * 0.08,
    yMax: maxR + span * 0.08,
  };
}

export function compactComparisonSvgPoint(
  seriesId: 'free_blitz' | 'free_rapid' | 'free_day',
  segment: 0 | 1,
  u: number,
  trackIds: readonly string[] = ['free_blitz', 'free_rapid', 'free_day'],
): { x: number; y: number } {
  const points = LANDSCAPE_TICKER_CROSSING_HISTORY[seriesId];
  const a = points[segment];
  const b = points[segment + 1];
  if (!a || !b) {
    throw new Error(`Compact crossing segment missing for ${seriesId}`);
  }
  const t0 = Date.parse(a.occurredAt);
  const t1 = Date.parse(b.occurredAt);
  const t = t0 + u * (t1 - t0);
  const rating = a.ratingAfter + u * (b.ratingAfter - a.ratingAfter);
  const domain = compactComparisonDomain(trackIds);
  const tSpan = Math.max(domain.maxT - domain.minT, 1);
  const x =
    COMPACT_COMPARISON_CHART.pad +
    ((t - domain.minT) / tSpan) * (COMPACT_COMPARISON_CHART.width - COMPACT_COMPARISON_CHART.pad * 2);
  const yT = (rating - domain.yMin) / (domain.yMax - domain.yMin);
  const y =
    COMPACT_COMPARISON_CHART.height -
    COMPACT_COMPARISON_CHART.pad -
    yT *
      (COMPACT_COMPARISON_CHART.height -
        COMPACT_COMPARISON_CHART.topAxisBand -
        COMPACT_COMPARISON_CHART.pad);
  return { x, y };
}

export function compactCrossingAgrees(hit: CrossingHit): boolean {
  const a = compactComparisonSvgPoint(hit.a as 'free_blitz' | 'free_rapid' | 'free_day', hit.segment, hit.u);
  const b = compactComparisonSvgPoint(hit.b as 'free_blitz' | 'free_rapid' | 'free_day', hit.segment, hit.u);
  return Math.abs(a.x - b.x) < 0.6 && Math.abs(a.y - b.y) < 0.6;
}
