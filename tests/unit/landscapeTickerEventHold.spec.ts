import { expect, test } from '@playwright/test';

import {
  landscapeTickerPathFromPoints,
  landscapeTickerRatingDomain,
  pathHasDiagonalBetweenEvents,
  toLandscapeTickerXMs,
  type LandscapeTickerPlotGeometry,
} from '../../lib/profile/landscapeTickerPath';
import type { RatingHistoryPoint } from '../../lib/ratingHistoryTypes';

function point(partial: Partial<RatingHistoryPoint> & { id: string; occurredAt: string }): RatingHistoryPoint {
  return {
    playerId: 'u1',
    ecosystem: 'free',
    eventType: 'game',
    result: 'win',
    ratingTrackId: 'free_blitz',
    ratingBefore: 1000,
    ratingAfter: 1010,
    ratingDelta: 10,
    ...partial,
  };
}

const geometry: LandscapeTickerPlotGeometry = {
  width: 400,
  height: 200,
  pad: 20,
  axisBand: 22,
  minT: Date.parse('2026-06-01T00:00:00Z'),
  maxT: Date.parse('2026-09-01T00:00:00Z'),
  minR: 900,
  maxR: 1200,
};

test.describe('landscape ticker event-hold path', () => {
  test('step-after is horizontal then vertical with markers only at real events', () => {
    const a = point({
      id: 'june',
      occurredAt: '2026-06-30T12:00:00Z',
      ratingBefore: 990,
      ratingAfter: 1000,
      ratingDelta: 10,
    });
    const b = point({
      id: 'aug',
      occurredAt: '2026-08-12T12:00:00Z',
      ratingBefore: 1000,
      ratingAfter: 1080,
      ratingDelta: 80,
    });
    const path = landscapeTickerPathFromPoints([a, b], geometry);
    expect(path).not.toBeNull();
    expect(path!.plotted).toHaveLength(2);
    expect(path!.plotted.map((p) => p.point.id)).toEqual(['june', 'aug']);
    expect(path!.plotted[0].point.ratingAfter).toBe(1000);
    expect(path!.plotted[1].point.ratingAfter).toBe(1080);
    expect(path!.plotted[1].point.ratingDelta).toBe(80);
    expect(pathHasDiagonalBetweenEvents(path!.plotted, path!.d)).toBe(false);
    const rp = (n: number) => Math.round(n * 100) / 100;
    expect(path!.d).toContain(`L ${rp(path!.plotted[1].x)} ${rp(path!.plotted[0].y)}`);
    expect(path!.d).toContain(`L ${rp(path!.plotted[1].x)} ${rp(path!.plotted[1].y)}`);
  });

  test('carry-in hold has no marker and no fabricated event', () => {
    const inWindow = point({
      id: 'in',
      occurredAt: '2026-08-12T12:00:00Z',
      ratingAfter: 1080,
      ratingBefore: 1000,
      ratingDelta: 80,
    });
    const path = landscapeTickerPathFromPoints([inWindow], geometry, { carryInRating: 1000 });
    expect(path!.plotted).toHaveLength(1);
    expect(path!.plotted[0].point.id).toBe('in');
    const xLeft = toLandscapeTickerXMs(geometry.minT, geometry);
    expect(path!.d.startsWith(`M ${Math.round(xLeft * 100) / 100}`)).toBe(true);
    expect(path!.plotted.some((p) => p.point.id === 'carry')).toBe(false);
  });

  test('no carry-in when no prior event exists', () => {
    const inWindow = point({ id: 'in', occurredAt: '2026-08-12T12:00:00Z' });
    const path = landscapeTickerPathFromPoints([inWindow], geometry);
    const xLeft = toLandscapeTickerXMs(geometry.minT, geometry);
    expect(path!.d.startsWith(`M ${xLeft.toFixed(2)}`)).toBe(false);
    expect(path!.plotted).toHaveLength(1);
  });

  test('hold extends to the right boundary using the last real ratingAfter', () => {
    const a = point({ id: 'a', occurredAt: '2026-06-30T12:00:00Z', ratingAfter: 1000, ratingDelta: 0 });
    const path = landscapeTickerPathFromPoints([a], geometry);
    const xRight = toLandscapeTickerXMs(geometry.maxT, geometry);
    expect(path!.d).toContain(`L ${Math.round(xRight * 100) / 100} ${Math.round(path!.plotted[0].y * 100) / 100}`);
  });

  test('empty window with carry-in draws a hold and zero markers', () => {
    const path = landscapeTickerPathFromPoints([], geometry, { carryInRating: 1000 });
    expect(path).not.toBeNull();
    expect(path!.plotted).toHaveLength(0);
    expect(path!.d.startsWith('M ')).toBe(true);
    expect(path!.d).toContain(' L ');
  });

  test('empty window without carry-in does not invent a path', () => {
    expect(landscapeTickerPathFromPoints([], geometry)).toBeNull();
    expect(landscapeTickerPathFromPoints([], geometry, { carryInRating: null })).toBeNull();
  });

  test('rating domain includes carry-in without changing point ids or deltas', () => {
    const a = point({
      id: 'a',
      occurredAt: '2026-08-12T12:00:00Z',
      ratingAfter: 1080,
      ratingBefore: 1000,
      ratingDelta: 80,
    });
    const domain = landscapeTickerRatingDomain([[a]], [1000]);
    expect(domain).not.toBeNull();
    expect(domain!.minR).toBeLessThan(1000);
    expect(a.id).toBe('a');
    expect(a.ratingDelta).toBe(80);
    expect(a.occurredAt).toBe('2026-08-12T12:00:00Z');
  });
});
