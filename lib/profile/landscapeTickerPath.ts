/**
 * Plot geometry for landscape ticker paths.
 * Uses authoritative points only — never interpolates, synthesizes, or alters ratings.
 * Inactive time is a horizontal hold of the last real ratingAfter (step-after / ZOH).
 * At the next real event timestamp the path steps vertically to that event's ratingAfter.
 * Carry-in may use only the last real ratingAfter before the window; it is not a marker.
 * Hold-to-edge extends the last real in-window ratingAfter to geometry.maxT.
 *
 * A non-null path is drawable (in-window events OR a carry-in hold).
 * `plotted` is the in-window marker set only — never a carry-in vertex.
 *
 * Path-length note: the step polyline is longer than a diagonal chord between events.
 * Existing hero/quiet stroke-dashoffset animations still run on pathLength={1} for the
 * same HERO_MS / QUIET_MS; more of that duration is spent tracing holds than jumps.
 */

import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';

export type LandscapeTickerPlotGeometry = {
  width: number;
  height: number;
  pad: number;
  /** Extra bottom band reserved for the time axis. Defaults to 0. */
  axisBand?: number;
  /** Absolute top inset reserved for a top time axis. Defaults to pad. */
  topAxisBand?: number;
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

export type LandscapeTickerPathOptions = {
  /** Last real ratingAfter strictly before geometry.minT. Not a fabricated event. */
  carryInRating?: number | null;
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

function padBottom(geometry: LandscapeTickerPlotGeometry): number {
  return geometry.pad + (geometry.axisBand ?? 0);
}

function padTop(geometry: LandscapeTickerPlotGeometry): number {
  return geometry.topAxisBand ?? geometry.pad;
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
  extraRatings: number[] = [],
): { minR: number; maxR: number } | null {
  const ratings: number[] = [...extraRatings.filter((n) => Number.isFinite(n))];
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

export function toLandscapeTickerXMs(
  t: number,
  geometry: LandscapeTickerPlotGeometry,
): number {
  if (!Number.isFinite(t)) return geometry.width / 2;
  if (geometry.maxT === geometry.minT) return geometry.width / 2;
  const inner = geometry.width - geometry.pad * 2;
  return geometry.pad + ((t - geometry.minT) / (geometry.maxT - geometry.minT)) * inner;
}

export function toLandscapeTickerX(
  iso: string,
  geometry: LandscapeTickerPlotGeometry,
): number {
  return toLandscapeTickerXMs(parseTime(iso), geometry);
}

export function toLandscapeTickerY(
  rating: number,
  geometry: LandscapeTickerPlotGeometry,
): number {
  const span = geometry.maxR - geometry.minR;
  const top = padTop(geometry);
  const bottom = padBottom(geometry);
  if (span === 0) return (top + (geometry.height - bottom)) / 2;
  const t = (rating - geometry.minR) / span;
  const inner = geometry.height - top - bottom;
  return geometry.height - bottom - t * inner;
}

/** Stable left-axis labels spanning the exact drawable rating domain. */
export function landscapeTickerRatingTicks(
  minR: number,
  maxR: number,
  sections = 4,
): number[] {
  if (!Number.isFinite(minR) || !Number.isFinite(maxR) || maxR < minR) return [];
  const safeSections = Math.max(1, Math.floor(sections));
  const span = maxR - minR;
  if (span === 0) return [Math.round(minR)];
  const ticks: number[] = [];
  for (let i = 0; i <= safeSections; i += 1) {
    ticks.push(Math.round(maxR - (span * i) / safeSections));
  }
  return ticks.filter((rating, index) => index === 0 || rating !== ticks[index - 1]);
}

function roundPlot(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Build an SVG path through real ledger points only (step-after).
 * Zero in-window points and no carry-in → null (not drawable).
 * Markers (`plotted`) are real in-window events only. A carry-in-only path is
 * drawable with `plotted.length === 0`.
 */
export function landscapeTickerPathFromPoints(
  points: RatingHistoryPoint[],
  geometry: LandscapeTickerPlotGeometry,
  options?: LandscapeTickerPathOptions,
): { d: string; plotted: LandscapeTickerPlottedPoint[] } | null {
  const sorted = sortChronological(points).filter((p) => Number.isFinite(parseTime(p.occurredAt)));
  const carry =
    typeof options?.carryInRating === 'number' && Number.isFinite(options.carryInRating)
      ? options.carryInRating
      : null;
  if (sorted.length === 0 && carry == null) return null;

  const plotted: LandscapeTickerPlottedPoint[] = sorted.map((point) => ({
    point,
    x: toLandscapeTickerX(point.occurredAt, geometry),
    y: toLandscapeTickerY(point.ratingAfter, geometry),
  }));

  const xLeft = toLandscapeTickerXMs(geometry.minT, geometry);
  const xRight = toLandscapeTickerXMs(geometry.maxT, geometry);
  const cmds: string[] = [];

  if (sorted.length === 0 && carry != null) {
    const y = toLandscapeTickerY(carry, geometry);
    cmds.push(`M ${roundPlot(xLeft)} ${roundPlot(y)}`);
    cmds.push(`L ${roundPlot(xRight)} ${roundPlot(y)}`);
    return { d: cmds.join(' '), plotted: [] };
  }

  const first = plotted[0];
  if (carry != null) {
    const yHold = toLandscapeTickerY(carry, geometry);
    cmds.push(`M ${roundPlot(xLeft)} ${roundPlot(yHold)}`);
    cmds.push(`L ${roundPlot(first.x)} ${roundPlot(yHold)}`);
    cmds.push(`L ${roundPlot(first.x)} ${roundPlot(first.y)}`);
  } else {
    cmds.push(`M ${roundPlot(first.x)} ${roundPlot(first.y)}`);
  }

  for (let i = 1; i < plotted.length; i += 1) {
    const prev = plotted[i - 1];
    const cur = plotted[i];
    cmds.push(`L ${roundPlot(cur.x)} ${roundPlot(prev.y)}`);
    cmds.push(`L ${roundPlot(cur.x)} ${roundPlot(cur.y)}`);
  }

  const last = plotted[plotted.length - 1];
  if (last.x < xRight - 0.05) {
    cmds.push(`L ${roundPlot(xRight)} ${roundPlot(last.y)}`);
  }

  return { d: cmds.join(' '), plotted };
}

/** True when consecutive event vertices are joined by a diagonal (forbidden). */
export function pathHasDiagonalBetweenEvents(
  plotted: LandscapeTickerPlottedPoint[],
  d: string,
): boolean {
  if (plotted.length < 2) return false;
  for (let i = 1; i < plotted.length; i += 1) {
    const a = plotted[i - 1];
    const b = plotted[i];
    if (Math.abs(a.x - b.x) < 0.05 || Math.abs(a.y - b.y) < 0.05) continue;
    const diag = `L ${roundPlot(b.x)} ${roundPlot(b.y)}`;
    const hold = `L ${roundPlot(b.x)} ${roundPlot(a.y)}`;
    if (d.includes(diag) && !d.includes(hold)) return true;
  }
  return false;
}
