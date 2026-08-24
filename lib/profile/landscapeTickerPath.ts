/**
 * Plot geometry for landscape ticker paths.
 * Uses authoritative points only — never interpolates, synthesizes, or alters ratings.
 */

import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';

export type LandscapeTickerPlotGeometry = {
  width: number;
  height: number;
  pad: number;
  minT: number;
  maxT: number;
  minR: number;
  maxR: number;
};

export type LandscapeTickerPlottedPoint = {
  point: RatingHistoryPoint;
  x: number;
  y: number;
};

function parseTime(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : NaN;
}

function sortChronological(points: RatingHistoryPoint[]): RatingHistoryPoint[] {
  return [...points].sort(
    (a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
  );
}

export function landscapeTickerTimeDomain(
  seriesPoints: RatingHistoryPoint[][],
): { minT: number; maxT: number } | null {
  const times: number[] = [];
  for (const points of seriesPoints) {
    for (const p of points) {
      const t = parseTime(p.occurredAt);
      if (Number.isFinite(t)) times.push(t);
    }
  }
  if (times.length === 0) return null;
  return { minT: Math.min(...times), maxT: Math.max(...times) };
}

export function landscapeTickerRatingDomain(
  seriesPoints: RatingHistoryPoint[][],
): { minR: number; maxR: number } | null {
  const ratings: number[] = [];
  for (const points of seriesPoints) {
    for (const p of points) {
      if (typeof p.ratingAfter === 'number' && Number.isFinite(p.ratingAfter)) {
        ratings.push(p.ratingAfter);
      }
    }
  }
  if (ratings.length === 0) return null;
  const minR = Math.min(...ratings);
  const maxR = Math.max(...ratings);
  const span = Math.max(maxR - minR, 40);
  return { minR: minR - span * 0.08, maxR: maxR + span * 0.08 };
}

export function toLandscapeTickerX(
  iso: string,
  geometry: LandscapeTickerPlotGeometry,
): number {
  const t = parseTime(iso);
  if (!Number.isFinite(t)) return geometry.width / 2;
  if (geometry.maxT === geometry.minT) return geometry.width / 2;
  const inner = geometry.width - geometry.pad * 2;
  return geometry.pad + ((t - geometry.minT) / (geometry.maxT - geometry.minT)) * inner;
}

export function toLandscapeTickerY(
  rating: number,
  geometry: LandscapeTickerPlotGeometry,
): number {
  const span = geometry.maxR - geometry.minR;
  if (span === 0) return geometry.height / 2;
  const t = (rating - geometry.minR) / span;
  return geometry.height - geometry.pad - t * (geometry.height - geometry.pad * 2);
}

/**
 * Build an SVG path through real ledger points only.
 * Zero points → null. One point → move-only (marker, no fabricated segment).
 */
export function landscapeTickerPathFromPoints(
  points: RatingHistoryPoint[],
  geometry: LandscapeTickerPlotGeometry,
): { d: string; plotted: LandscapeTickerPlottedPoint[] } | null {
  const sorted = sortChronological(points).filter((p) => Number.isFinite(parseTime(p.occurredAt)));
  if (sorted.length === 0) return null;

  const plotted: LandscapeTickerPlottedPoint[] = sorted.map((point) => ({
    point,
    x: toLandscapeTickerX(point.occurredAt, geometry),
    y: toLandscapeTickerY(point.ratingAfter, geometry),
  }));

  const d = plotted
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${roundPlot(p.x)} ${roundPlot(p.y)}`)
    .join(' ');

  return { d, plotted };
}

function roundPlot(n: number): number {
  return Math.round(n * 100) / 100;
}
