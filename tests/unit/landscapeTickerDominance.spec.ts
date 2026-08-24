import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { LANDSCAPE_TICKER_CATEGORIES } from '../../lib/profile/landscapeTickerCategories';
import {
  BLITZ_RAPID_CROSS_U,
  LANDSCAPE_TICKER_CROSSING_HISTORY,
  landscapeTickerCrossingHits,
  landscapeTickerCrossingPlotGeometry,
  landscapeTickerCrossingSvgPoint,
  landscapeTickerSharedCrossingVertex,
} from '../helpers/landscapeTickerCrossingFixture';
import {
  landscapeTickerPathFromPoints,
  landscapeTickerRatingDomain,
  landscapeTickerTimeDomain,
} from '../../lib/profile/landscapeTickerPath';
import {
  categoryRevealPhase,
  createLandscapeTickerSession,
  dominanceRank,
  frontMostVisibleCategory,
  reduceLandscapeTickerSession,
  visibleCategoryIds,
  visibleDominanceOrder,
  type LandscapeTickerSession,
} from '../../lib/profile/landscapeTickerSession';
import type { RatingHistoryPoint } from '../../lib/ratingHistoryTypes';

const root = process.cwd();

function src(rel: string): string {
  return readFileSync(join(root, ...rel.split('/')), 'utf8');
}

function toggle(
  session: LandscapeTickerSession,
  categoryId: (typeof LANDSCAPE_TICKER_CATEGORIES)[number]['id'],
  reducedMotion = false,
) {
  return reduceLandscapeTickerSession(session, { type: 'toggle', categoryId, reducedMotion });
}

function complete(session: LandscapeTickerSession, reducedMotion = false) {
  if (!session.activeReveal) return session;
  return reduceLandscapeTickerSession(session, {
    type: 'revealComplete',
    categoryId: session.activeReveal.categoryId,
    serial: session.activeReveal.serial,
    reducedMotion,
  });
}

function assertDominanceInvariants(session: LandscapeTickerSession) {
  expect(new Set(session.dominanceOrder).size).toBe(session.dominanceOrder.length);
  for (const id of session.dominanceOrder) {
    expect(session.selectedIds).toContain(id);
  }
}

test.describe('landscape ticker activation dominance', () => {
  test('first selected line is dominant', () => {
    const session = toggle(createLandscapeTickerSession(), 'free_blitz');
    expect(visibleDominanceOrder(session)).toEqual(['free_blitz']);
    expect(frontMostVisibleCategory(session)).toBe('free_blitz');
    expect(dominanceRank(session, 'free_blitz')).toBe(0);
    assertDominanceInvariants(session);
  });

  test('second selected line becomes dominant after it is introduced', () => {
    let session = toggle(createLandscapeTickerSession(), 'free_blitz');
    session = toggle(session, 'free_rapid');
    expect(session.pendingActivations).toEqual(['free_rapid']);
    expect(visibleDominanceOrder(session)).toEqual(['free_blitz']);
    expect(frontMostVisibleCategory(session)).toBe('free_blitz');
    session = complete(session);
    expect(visibleDominanceOrder(session)).toEqual(['free_blitz', 'free_rapid']);
    expect(frontMostVisibleCategory(session)).toBe('free_rapid');
    assertDominanceInvariants(session);
  });

  test('Blitz then Rapid then Daily is back-to-front Blitz/Rapid/Daily', () => {
    let session = toggle(createLandscapeTickerSession(), 'free_blitz');
    session = toggle(session, 'free_rapid');
    session = toggle(session, 'free_day');
    session = complete(session);
    session = complete(session);
    expect(visibleDominanceOrder(session)).toEqual(['free_blitz', 'free_rapid', 'free_day']);
    expect(frontMostVisibleCategory(session)).toBe('free_day');
    expect(visibleCategoryIds(session)).toEqual(['free_blitz', 'free_rapid', 'free_day']);
    assertDominanceInvariants(session);
  });

  test('removing Daily exposes Rapid; removing Rapid exposes Blitz', () => {
    let session = toggle(createLandscapeTickerSession(), 'free_blitz');
    session = toggle(session, 'free_rapid');
    session = toggle(session, 'free_day');
    session = complete(complete(session));
    session = toggle(session, 'free_day');
    expect(visibleDominanceOrder(session)).toEqual(['free_blitz', 'free_rapid']);
    expect(frontMostVisibleCategory(session)).toBe('free_rapid');
    session = toggle(session, 'free_rapid');
    expect(visibleDominanceOrder(session)).toEqual(['free_blitz']);
    expect(frontMostVisibleCategory(session)).toBe('free_blitz');
    assertDominanceInvariants(session);
  });

  test('deselecting and reselecting Blitz brings it to front with quiet redraw', () => {
    let session = toggle(createLandscapeTickerSession(), 'free_blitz');
    session = complete(session);
    session = toggle(session, 'free_rapid');
    session = complete(session);
    expect(frontMostVisibleCategory(session)).toBe('free_rapid');
    session = toggle(session, 'free_blitz');
    expect(session.dominanceOrder).not.toContain('free_blitz');
    session = toggle(session, 'free_blitz');
    expect(session.activeReveal?.kind).toBe('quiet');
    expect(categoryRevealPhase(session, 'free_blitz')).toBe('quiet');
    expect(visibleDominanceOrder(session)).toEqual(['free_rapid', 'free_blitz']);
    expect(frontMostVisibleCategory(session)).toBe('free_blitz');
    assertDominanceInvariants(session);
  });

  test('queued rapid selections become dominant in introduction order', () => {
    let session = toggle(createLandscapeTickerSession(), 'free_bullet');
    session = toggle(session, 'free_blitz');
    session = toggle(session, 'free_rapid');
    expect(session.pendingActivations).toEqual(['free_blitz', 'free_rapid']);
    expect(visibleDominanceOrder(session)).toEqual(['free_bullet']);
    session = complete(session);
    expect(visibleDominanceOrder(session)).toEqual(['free_bullet', 'free_blitz']);
    expect(frontMostVisibleCategory(session)).toBe('free_blitz');
    session = complete(session);
    expect(visibleDominanceOrder(session)).toEqual(['free_bullet', 'free_blitz', 'free_rapid']);
    expect(frontMostVisibleCategory(session)).toBe('free_rapid');
    session = complete(session);
    expect(session.activeReveal).toBeNull();
    expect(visibleDominanceOrder(session)).toEqual(['free_bullet', 'free_blitz', 'free_rapid']);
    assertDominanceInvariants(session);
  });

  test('reduced-motion selections still update dominance immediately', () => {
    let session = toggle(createLandscapeTickerSession(), 'free_blitz', true);
    expect(session.activeReveal).toBeNull();
    expect(visibleDominanceOrder(session)).toEqual(['free_blitz']);
    session = toggle(session, 'free_rapid', true);
    expect(visibleDominanceOrder(session)).toEqual(['free_blitz', 'free_rapid']);
    session = toggle(session, 'free_day', true);
    expect(visibleDominanceOrder(session)).toEqual(['free_blitz', 'free_rapid', 'free_day']);
    expect(frontMostVisibleCategory(session)).toBe('free_day');
    assertDominanceInvariants(session);
  });

  test('lane and viewport settle preserve dominance and introduce pending in queue order', () => {
    let session = toggle(createLandscapeTickerSession(), 'free_blitz');
    session = toggle(session, 'free_rapid');
    session = toggle(session, 'free_day');
    expect(visibleDominanceOrder(session)).toEqual(['free_blitz']);
    session = reduceLandscapeTickerSession(session, { type: 'settleSelected' });
    expect(session.activeReveal).toBeNull();
    expect(visibleDominanceOrder(session)).toEqual(['free_blitz', 'free_rapid', 'free_day']);
    const afterLane = visibleDominanceOrder(session);
    session = reduceLandscapeTickerSession(session, { type: 'settleForViewportChange' });
    expect(visibleDominanceOrder(session)).toEqual(afterLane);
    assertDominanceInvariants(session);
  });

  test('close/reset clears dominance; family pager is not stored on the session', () => {
    let session = toggle(createLandscapeTickerSession(), 'free_blitz');
    session = complete(session);
    expect(session.dominanceOrder).toEqual(['free_blitz']);
    session = reduceLandscapeTickerSession(session, { type: 'reset' });
    expect(session).toEqual(createLandscapeTickerSession());
    expect(session.dominanceOrder).toEqual([]);
    expect(JSON.stringify(session)).not.toContain('battlefield');
    expect(JSON.stringify(session)).not.toContain('kptv');
  });

  test('category-button order, colors, and axis math stay independent of dominance', () => {
    expect(LANDSCAPE_TICKER_CATEGORIES.map((c) => c.label)).toEqual([
      'Overall ACCL',
      'Tournament',
      'Bullet',
      'Blitz',
      'Rapid',
      'Daily',
    ]);
    expect(LANDSCAPE_TICKER_CATEGORIES.map((c) => c.color)).toEqual([
      '#34d399',
      '#eab308',
      '#f472b6',
      '#fb923c',
      '#38bdf8',
      '#a78bfa',
    ]);
    const drawer = src('components/profile/ratings/ExpandedRatingTickerDrawer.tsx');
    expect(drawer).toContain('LANDSCAPE_TICKER_CATEGORIES.map');
    expect(drawer).toContain('data-testid="landscape-ticker-category-controls"');
    expect(drawer).not.toContain('dominanceOrder.map((cat)');
    const a: RatingHistoryPoint = {
      id: 'a',
      playerId: 'u1',
      ecosystem: 'free',
      eventType: 'game',
      result: 'win',
      ratingTrackId: 'free_blitz',
      ratingBefore: 1511,
      ratingAfter: 1528,
      ratingDelta: 17,
      occurredAt: '2026-08-20T12:00:00Z',
    };
    const b: RatingHistoryPoint = {
      ...a,
      id: 'b',
      ratingTrackId: 'free_rapid',
      ratingBefore: 1499,
      ratingAfter: 1506,
      ratingDelta: 7,
      occurredAt: '2026-08-19T15:00:00Z',
    };
    const domain = landscapeTickerRatingDomain([[a], [b]]);
    expect(domain?.minR).toBeLessThan(1506);
    expect(domain?.maxR).toBeGreaterThan(1528);
    const geometry = {
      width: 400,
      height: 200,
      pad: 32,
      ...(landscapeTickerTimeDomain([[a], [b]]) as { minT: number; maxT: number }),
      ...(domain as { minR: number; maxR: number }),
    };
    const pathA = landscapeTickerPathFromPoints([a], geometry);
    const pathB = landscapeTickerPathFromPoints([b], geometry);
    expect(pathA?.plotted[0].point.ratingAfter).toBe(1528);
    expect(pathB?.plotted[0].point.ratingAfter).toBe(1506);
    expect(pathA?.plotted[0].point.id).toBe('a');
    expect(src('components/profile/ratings/LandscapeRatingTickerChart.tsx')).toContain(
      'landscapeTickerRatingDomain',
    );
    expect(src('lib/profile/landscapeTickerSession.ts')).not.toContain('applyFreePlayRatingUpdate');
  });

  test('zero-event categories never fabricate a dominance line of invented points', () => {
    const empty = landscapeTickerPathFromPoints([], {
      width: 400,
      height: 200,
      pad: 20,
      minT: 0,
      maxT: 10,
      minR: 1400,
      maxR: 1600,
    });
    expect(empty).toBeNull();
    const session = toggle(createLandscapeTickerSession(), 'accl', true);
    expect(visibleDominanceOrder(session)).toEqual(['accl']);
    expect(src('components/profile/ratings/LandscapeRatingTickerChart.tsx')).toContain(
      'landscape-ticker-zero-event-plot',
    );
  });

  test('crossing fixture has two visible Blitz/Rapid intersections and a shared vertex', () => {
    const hits = landscapeTickerCrossingHits();
    const blitzRapid = hits.filter((h) => h.a === 'free_blitz' && h.b === 'free_rapid');
    expect(blitzRapid).toHaveLength(2);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(blitzRapid.every((h) => Math.abs(h.u - BLITZ_RAPID_CROSS_U) < 1e-9)).toBe(true);
    expect(blitzRapid.every((h) => h.rating === 1500)).toBe(true);
    const shared = landscapeTickerSharedCrossingVertex();
    expect(shared.ratingAfter).toBe(1400);
    expect(shared.ids).toEqual(['x-bz-2', 'x-dy-2']);
    const geometry = landscapeTickerCrossingPlotGeometry();
    const blitz = landscapeTickerCrossingSvgPoint('free_blitz', 0, BLITZ_RAPID_CROSS_U, geometry);
    const rapid = landscapeTickerCrossingSvgPoint('free_rapid', 0, BLITZ_RAPID_CROSS_U, geometry);
    expect(Math.abs(blitz.x - rapid.x)).toBeLessThan(0.6);
    expect(Math.abs(blitz.y - rapid.y)).toBeLessThan(0.6);
    expect(LANDSCAPE_TICKER_CROSSING_HISTORY.free_blitz.map((p) => p.ratingAfter)).toEqual([
      1600, 1400, 1600,
    ]);
    expect(src('lib/profile/landscapeTickerPath.ts')).toContain('never interpolates');
    expect(src('components/profile/ratings/LandscapeRatingTickerChart.tsx')).not.toContain(
      'LANDSCAPE_TICKER_CROSSING_HISTORY',
    );
  });

  test('chart paints back-most first and keeps the active reveal last', () => {
    const chart = src('components/profile/ratings/LandscapeRatingTickerChart.tsx');
    expect(chart).toContain('dominanceRank');
    expect(chart).toContain('ranked.push(active)');
    expect(chart).toContain('data-dominance-order');
    expect(chart).toContain('data-dominant');
    expect(chart).toContain('[...plotted].reverse()');
    expect(src('lib/profile/landscapeTickerSession.ts')).toContain('dominanceOrder');
    expect(src('lib/profile/landscapeTickerSession.ts')).toContain('moveToFront');
  });
});
