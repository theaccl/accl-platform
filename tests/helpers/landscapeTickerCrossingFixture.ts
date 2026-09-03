/**
 * Test-only intersecting rating histories.
 * Not production ledger data.
 *
 * Shared times T0/T1/T2:
 *   Blitz  1600 → 1400 → 1600
 *   Rapid  1400 → 1600 → 1400
 *   Daily  1550 → 1400 → 1550  (T1/1400 is an exact shared vertex with Blitz)
 *
 * Compact comparison still uses linear polylines, so mid-segment u remains
 * compact-only evidence. Landscape event-hold paths do not cross during holds.
 */
import {
  landscapeTickerPathFromPoints,
  landscapeTickerRatingDomain,
  landscapeTickerTimeDomain,
  type LandscapeTickerPlotGeometry,
} from '../../lib/profile/landscapeTickerPath';
import type { RatingHistoryPoint } from '../../lib/ratingHistoryTypes';

export const CROSSING_T0 = '2026-08-01T12:00:00Z';
export const CROSSING_T1 = '2026-08-15T12:00:00Z';
export const CROSSING_T2 = '2026-08-29T12:00:00Z';

type CrossingSeed = {
  id: string;
  ratingTrackId: RatingHistoryPoint['ratingTrackId'];
  ratingAfter: number;
  ratingBefore: number;
  ratingDelta: number;
  occurredAt: string;
};

function seed(partial: CrossingSeed): RatingHistoryPoint {
  return {
    playerId: 'crossing-fixture',
    ecosystem: 'free',
    eventType: 'game',
    result: 'win',
    gameId: `g-${partial.id}`,
    ...partial,
  };
}

export const LANDSCAPE_TICKER_CROSSING_HISTORY: Record<string, RatingHistoryPoint[]> = {
  free_blitz: [
    seed({
      id: 'x-bz-1',
      ratingTrackId: 'free_blitz',
      ratingBefore: 1588,
      ratingAfter: 1600,
      ratingDelta: 12,
      occurredAt: CROSSING_T0,
    }),
    seed({
      id: 'x-bz-2',
      ratingTrackId: 'free_blitz',
      ratingBefore: 1600,
      ratingAfter: 1400,
      ratingDelta: -200,
      occurredAt: CROSSING_T1,
    }),
    seed({
      id: 'x-bz-3',
      ratingTrackId: 'free_blitz',
      ratingBefore: 1400,
      ratingAfter: 1600,
      ratingDelta: 200,
      occurredAt: CROSSING_T2,
    }),
  ],
  free_rapid: [
    seed({
      id: 'x-rp-1',
      ratingTrackId: 'free_rapid',
      ratingBefore: 1412,
      ratingAfter: 1400,
      ratingDelta: -12,
      occurredAt: CROSSING_T0,
    }),
    seed({
      id: 'x-rp-2',
      ratingTrackId: 'free_rapid',
      ratingBefore: 1400,
      ratingAfter: 1600,
      ratingDelta: 200,
      occurredAt: CROSSING_T1,
    }),
    seed({
      id: 'x-rp-3',
      ratingTrackId: 'free_rapid',
      ratingBefore: 1600,
      ratingAfter: 1400,
      ratingDelta: -200,
      occurredAt: CROSSING_T2,
    }),
  ],
  free_day: [
    seed({
      id: 'x-dy-1',
      ratingTrackId: 'free_day',
      ratingBefore: 1542,
      ratingAfter: 1550,
      ratingDelta: 8,
      occurredAt: CROSSING_T0,
    }),
    seed({
      id: 'x-dy-2',
      ratingTrackId: 'free_day',
      ratingBefore: 1550,
      ratingAfter: 1400,
      ratingDelta: -150,
      occurredAt: CROSSING_T1,
    }),
    seed({
      id: 'x-dy-3',
      ratingTrackId: 'free_day',
      ratingBefore: 1400,
      ratingAfter: 1550,
      ratingDelta: 150,
      occurredAt: CROSSING_T2,
    }),
  ],
};

export type CrossingHit = {
  name: string;
  a: string;
  b: string;
  segment: 0 | 1;
  u: number;
  rating: number;
};

function segmentMeet(
  a0: number,
  a1: number,
  b0: number,
  b1: number,
): { u: number; rating: number } | null {
  const den = a1 - a0 - (b1 - b0);
  if (Math.abs(den) < 1e-9) return null;
  const u = (b0 - a0) / den;
  if (u <= 0.02 || u >= 0.98) return null;
  return { u, rating: a0 + u * (a1 - a0) };
}

export const BLITZ_RAPID_CROSS_U = 0.5;
export const DAILY_RAPID_FIRST_CROSS_U = (1400 - 1550) / (1400 - 1550 - (1600 - 1400));
/** Next real event vertex (T1), not a mid-hold interpolation. */
export const SHARED_EVENT_SAMPLE_U = 1;

export function landscapeTickerCrossingHits(): CrossingHit[] {
  const bz = LANDSCAPE_TICKER_CROSSING_HISTORY.free_blitz.map((p) => p.ratingAfter);
  const rp = LANDSCAPE_TICKER_CROSSING_HISTORY.free_rapid.map((p) => p.ratingAfter);
  const dy = LANDSCAPE_TICKER_CROSSING_HISTORY.free_day.map((p) => p.ratingAfter);
  const hits: CrossingHit[] = [];
  const pairs: Array<[string, string, number[], number[]]> = [
    ['free_blitz', 'free_rapid', bz, rp],
    ['free_day', 'free_rapid', dy, rp],
    ['free_blitz', 'free_day', bz, dy],
  ];
  for (const [a, b, ar, br] of pairs) {
    for (const segment of [0, 1] as const) {
      const meet = segmentMeet(ar[segment], ar[segment + 1], br[segment], br[segment + 1]);
      if (!meet) continue;
      hits.push({
        name: `${a}-x-${b}-s${segment}`,
        a,
        b,
        segment,
        u: meet.u,
        rating: meet.rating,
      });
    }
  }
  return hits;
}

export function landscapeTickerSharedCrossingVertex(): {
  occurredAt: string;
  ratingAfter: number;
  ids: string[];
} {
  return {
    occurredAt: CROSSING_T1,
    ratingAfter: 1400,
    ids: ['x-bz-2', 'x-dy-2'],
  };
}

export function landscapeTickerCrossingPlotGeometry(): LandscapeTickerPlotGeometry {
  const series = [
    LANDSCAPE_TICKER_CROSSING_HISTORY.free_blitz,
    LANDSCAPE_TICKER_CROSSING_HISTORY.free_rapid,
    LANDSCAPE_TICKER_CROSSING_HISTORY.free_day,
  ];
  const time = landscapeTickerTimeDomain(series);
  const rating = landscapeTickerRatingDomain(series);
  if (!time || !rating) {
    throw new Error('Crossing fixture must produce a real domain');
  }
  return {
    width: 720,
    height: 220,
    pad: 32,
    ...time,
    ...rating,
  };
}

export function landscapeTickerCrossingSvgPoint(
  seriesId: 'free_blitz' | 'free_rapid' | 'free_day',
  segment: 0 | 1,
  u: number,
  geometry: LandscapeTickerPlotGeometry = landscapeTickerCrossingPlotGeometry(),
): { x: number; y: number } {
  const points = LANDSCAPE_TICKER_CROSSING_HISTORY[seriesId];
  const path = landscapeTickerPathFromPoints(points, geometry);
  if (!path || path.plotted.length < 2) {
    throw new Error(`Crossing fixture path missing for ${seriesId}`);
  }
  const a = path.plotted[segment];
  const b = path.plotted[segment + 1];
  return {
    x: a.x + u * (b.x - a.x),
    y: a.y + u * (b.y - a.y),
  };
}
