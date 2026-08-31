import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { LANDSCAPE_TICKER_CATEGORIES } from '../../lib/profile/landscapeTickerCategories';
import {
  adjacentLandscapeTickerFamily,
  LANDSCAPE_TICKER_DEFAULT_FAMILY,
  LANDSCAPE_TICKER_FAMILIES,
} from '../../lib/profile/landscapeTickerFamilies';
import {
  landscapeTickerPathFromPoints,
  landscapeTickerRatingDomain,
  landscapeTickerTimeDomain,
} from '../../lib/profile/landscapeTickerPath';
import {
  categoryRevealPhase,
  createLandscapeTickerSession,
  isCategoryLineVisible,
  isCategoryQueued,
  isCategorySelected,
  reduceLandscapeTickerSession,
  visibleCategoryIds,
} from '../../lib/profile/landscapeTickerSession';
import { MAJOR_FAMILY_COMPARISON_SERIES } from '../../lib/profileRatingChartLevels';
import type { RatingHistoryPoint } from '../../lib/ratingHistoryTypes';

const root = process.cwd();

function src(rel: string): string {
  return readFileSync(join(root, ...rel.split('/')), 'utf8');
}

function point(partial: Partial<RatingHistoryPoint> & { id: string }): RatingHistoryPoint {
  return {
    playerId: 'u1',
    ecosystem: 'free',
    eventType: 'game',
    result: 'win',
    ratingTrackId: 'free_blitz',
    ratingBefore: 1500,
    ratingAfter: 1510,
    ratingDelta: 10,
    occurredAt: '2026-05-01T12:00:00Z',
    ...partial,
  };
}

function toggle(
  session: ReturnType<typeof createLandscapeTickerSession>,
  categoryId: (typeof LANDSCAPE_TICKER_CATEGORIES)[number]['id'],
  reducedMotion = false,
) {
  return reduceLandscapeTickerSession(session, { type: 'toggle', categoryId, reducedMotion });
}

function complete(
  session: ReturnType<typeof createLandscapeTickerSession>,
  reducedMotion = false,
) {
  if (!session.activeReveal) return session;
  return reduceLandscapeTickerSession(session, {
    type: 'revealComplete',
    categoryId: session.activeReveal.categoryId,
    serial: session.activeReveal.serial,
    reducedMotion,
  });
}

test.describe('profile rating ticker landscape interactive reveal', () => {
  test('expanded ticker opens with zero selected or visible lines', () => {
    const session = createLandscapeTickerSession();
    expect(session.selectedIds).toEqual([]);
    expect(session.activeReveal).toBeNull();
    expect(visibleCategoryIds(session)).toEqual([]);
    expect(src('components/profile/ratings/ExpandedRatingTickerDrawer.tsx')).toContain(
      'createLandscapeTickerSession()',
    );
    expect(src('components/profile/ratings/LandscapeRatingTickerChart.tsx')).toContain(
      'data-empty-open',
    );
  });

  test('opening alone does not start a reveal', () => {
    const opened = reduceLandscapeTickerSession(createLandscapeTickerSession(), { type: 'reset' });
    expect(opened.activeReveal).toBeNull();
    expect(opened.selectedIds).toHaveLength(0);
    const drawer = src('components/profile/ratings/ExpandedRatingTickerDrawer.tsx');
    expect(drawer).toContain('createLandscapeTickerSession');
    expect(drawer).toContain('LANDSCAPE_TICKER_DEFAULT_FAMILY');
    expect(drawer).toContain('if (!props.open || typeof document === \'undefined\') return null');
    expect(drawer).toContain('onClick={() => toggleCategory(cat.id)}');
  });

  test('selecting a category shows only its real path and deselect hides it', () => {
    let session = toggle(createLandscapeTickerSession(), 'free_blitz');
    expect(isCategorySelected(session, 'free_blitz')).toBe(true);
    expect(isCategoryLineVisible(session, 'free_blitz')).toBe(true);
    expect(isCategoryLineVisible(session, 'free_bullet')).toBe(false);
    expect(visibleCategoryIds(session)).toEqual(['free_blitz']);
    session = toggle(session, 'free_blitz');
    expect(isCategorySelected(session, 'free_blitz')).toBe(false);
    expect(isCategoryLineVisible(session, 'free_blitz')).toBe(false);
    expect(visibleCategoryIds(session)).toEqual([]);
  });

  test('multiple categories can coexist after serialized reveals', () => {
    let session = toggle(createLandscapeTickerSession(), 'tournament');
    session = toggle(session, 'free_rapid');
    expect(isCategoryQueued(session, 'free_rapid')).toBe(true);
    expect(isCategoryLineVisible(session, 'free_rapid')).toBe(false);
    expect(session.activeReveal?.categoryId).toBe('tournament');
    session = complete(session);
    expect(isCategoryLineVisible(session, 'tournament')).toBe(true);
    expect(isCategoryLineVisible(session, 'free_rapid')).toBe(true);
    expect(session.activeReveal?.categoryId).toBe('free_rapid');
    session = complete(session);
    expect(visibleCategoryIds(session).sort()).toEqual(['free_rapid', 'tournament']);
    expect(session.activeReveal).toBeNull();
  });

  test('first selection is hero; same-session reselection is quiet redraw', () => {
    let session = toggle(createLandscapeTickerSession(), 'accl');
    expect(session.activeReveal?.kind).toBe('hero');
    expect(categoryRevealPhase(session, 'accl')).toBe('hero');
    session = complete(session);
    session = toggle(session, 'accl');
    session = toggle(session, 'accl');
    expect(session.activeReveal?.kind).toBe('quiet');
    expect(categoryRevealPhase(session, 'accl')).toBe('quiet');
  });

  test('closing and reopening resets session reveal state', () => {
    let session = toggle(createLandscapeTickerSession(), 'free_day');
    session = complete(session);
    expect(session.heroRevealedIds).toContain('free_day');
    session = reduceLandscapeTickerSession(session, { type: 'reset' });
    expect(session).toEqual(createLandscapeTickerSession());
    session = toggle(session, 'free_day');
    expect(session.activeReveal?.kind).toBe('hero');
  });

  test('rapid selections are serialized rather than simultaneous heroes', () => {
    let session = toggle(createLandscapeTickerSession(), 'free_bullet');
    session = toggle(session, 'free_blitz');
    session = toggle(session, 'free_rapid');
    expect(session.activeReveal?.categoryId).toBe('free_bullet');
    expect(session.activeReveal?.kind).toBe('hero');
    expect(session.pendingActivations).toEqual(['free_blitz', 'free_rapid']);
    expect(session.selectedIds).toEqual(['free_bullet', 'free_blitz', 'free_rapid']);
    const heroCount = [session.activeReveal, ...session.pendingActivations].filter(Boolean);
    expect(heroCount.length).toBe(3);
    expect(visibleCategoryIds(session)).toEqual(['free_bullet']);
  });

  test('reduced motion suppresses dramatic effects and reveals immediately', () => {
    const session = toggle(createLandscapeTickerSession(), 'tournament', true);
    expect(session.activeReveal).toBeNull();
    expect(isCategoryLineVisible(session, 'tournament')).toBe(true);
    expect(categoryRevealPhase(session, 'tournament')).toBe('settled');
    const css = src('components/profile/ratings/landscapeRatingTicker.module.css');
    expect(css).toContain('prefers-reduced-motion');
    expect(css).toContain('animation: none !important');
    const chart = src('components/profile/ratings/LandscapeRatingTickerChart.tsx');
    expect(chart).toContain('reducedMotion');
    expect(chart).not.toContain('Math.random');
  });

  test('keyboard and aria-pressed behavior is encoded on category controls', () => {
    const drawer = src('components/profile/ratings/ExpandedRatingTickerDrawer.tsx');
    expect(drawer).toContain('aria-pressed={selected}');
    expect(drawer).toContain('type="button"');
    expect(drawer).toContain('role="dialog"');
    expect(drawer).toContain('aria-modal="true"');
    expect(drawer).toContain('landscape-ticker-series-summary');
    expect(drawer).toContain('shown');
    expect(drawer).toContain('hidden');
    const chrome = src('lib/profile/landscapeTickerDialogChrome.ts');
    expect(chrome).toContain("event.key === 'Escape'");
    expect(chrome).toContain('previousFocus?.focus');
  });

  test('category colors and labels remain distinct and Free Play only', () => {
    expect(LANDSCAPE_TICKER_CATEGORIES).toHaveLength(6);
    expect(LANDSCAPE_TICKER_CATEGORIES.map((c) => c.label)).toEqual([
      'Overall ACCL',
      'Tournament',
      'Bullet',
      'Blitz',
      'Rapid',
      'Daily',
    ]);
    const colors = LANDSCAPE_TICKER_CATEGORIES.map((c) => c.color);
    expect(new Set(colors).size).toBe(6);
    const blob = JSON.stringify(LANDSCAPE_TICKER_CATEGORIES).toLowerCase();
    expect(blob).not.toContain('battlefield');
    expect(blob).not.toContain('bot');
    expect(MAJOR_FAMILY_COMPARISON_SERIES).toHaveLength(5);
    expect(MAJOR_FAMILY_COMPARISON_SERIES.map((s) => s.trackId)).not.toContain('accl');
  });

  test('zero-event categories stay truthful and do not fabricate path points', () => {
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
    const drawer = src('components/profile/ratings/ExpandedRatingTickerDrawer.tsx');
    expect(drawer).toContain('data-empty={count === 0 ? \'true\' : \'false\'}');
    expect(drawer).toContain('RATING_LANE_EMPTY');
    expect(src('components/profile/ratings/LandscapeRatingTickerChart.tsx')).toContain(
      'landscape-ticker-zero-event-plot',
    );
  });

  test('compact ticker remains unchanged and does not host landscape animation', () => {
    const compact = src('components/profile/ratings/RatingTickerChart.tsx');
    expect(compact).toContain('rating-ticker-chart');
    expect(compact).not.toContain('landscape-ticker');
    expect(compact).not.toContain('heroGlow');
    expect(src('components/profile/ratings/RatingFamilyComparisonPanel.tsx')).toContain(
      'MAJOR_FAMILY_COMPARISON_SERIES',
    );
    expect(src('components/profile/ratings/RatingFamilyComparisonPanel.tsx')).not.toContain(
      'LANDSCAPE_TICKER_CATEGORIES',
    );
    expect(src('components/profile/ratings/RatingTrackDetailPanel.tsx')).toContain(
      'RatingTickerChart',
    );
  });

  test('path builder uses stored ratings and times without interpolation', () => {
    const a = point({
      id: 'a',
      ratingBefore: 1482,
      ratingAfter: 1491,
      ratingDelta: 9,
      occurredAt: '2026-05-01T12:00:00Z',
    });
    const b = point({
      id: 'b',
      ratingBefore: 1491,
      ratingAfter: 1477,
      ratingDelta: -14,
      occurredAt: '2026-05-02T12:00:00Z',
    });
    const geometry = {
      width: 400,
      height: 200,
      pad: 20,
      ...(landscapeTickerTimeDomain([[a, b]]) as { minT: number; maxT: number }),
      ...(landscapeTickerRatingDomain([[a, b]]) as { minR: number; maxR: number }),
    };
    const path = landscapeTickerPathFromPoints([a, b], geometry);
    expect(path).not.toBeNull();
    expect(path?.plotted).toHaveLength(2);
    expect(path?.plotted[0].point.ratingAfter).toBe(1491);
    expect(path?.plotted[1].point.ratingAfter).toBe(1477);
    expect(path?.plotted[0].point.ratingDelta).toBe(9);
    expect(path?.d.startsWith('M ')).toBe(true);
    expect(path?.d).toContain(' L ');
    expect(path?.d).not.toContain('interpolat');
    const single = landscapeTickerPathFromPoints([a], geometry);
    expect(single?.plotted).toHaveLength(1);
    expect(single?.d.startsWith('M ')).toBe(true);
    expect(single?.d).toContain(' L ');
    expect(single?.plotted[0].point.id).toBe('a');
  });

  test('no rating calculation or ledger writer changes in this lane', () => {
    const touched = [
      'lib/profile/landscapeTickerSession.ts',
      'lib/profile/landscapeTickerPath.ts',
      'lib/profile/landscapeTickerCategories.ts',
      'lib/profile/landscapeTickerViewport.ts',
      'lib/profile/landscapeTickerDialogChrome.ts',
      'lib/profile/landscapeTickerMotion.ts',
      'components/profile/ratings/LandscapeRatingTickerChart.tsx',
      'components/profile/ratings/ExpandedRatingTickerDrawer.tsx',
    ]
      .map((rel) => src(rel))
      .join('\n');
    expect(touched).not.toContain('applyFreePlayRatingUpdate');
    expect(touched).not.toContain('v2_elo_free');
    expect(touched).not.toContain('from(\'player_rating_history_ledger\')');
    expect(src('lib/applyFreePlayRatingUpdate.ts')).toContain('export');
    expect(src('lib/ratingHistoryLedgerBuild.ts')).toContain('buildRatingHistoryPointsFromLedger');
  });

  test('lane change settles selected lines without replaying heroes', () => {
    let session = toggle(createLandscapeTickerSession(), 'free_blitz');
    session = toggle(session, 'free_bullet');
    expect(session.activeReveal?.kind).toBe('hero');
    expect(session.pendingActivations).toEqual(['free_bullet']);
    const serial = session.activeReveal?.serial;
    session = reduceLandscapeTickerSession(session, { type: 'settleSelected' });
    expect(session.activeReveal).toBeNull();
    expect(session.pendingActivations).toEqual([]);
    expect(isCategorySelected(session, 'free_blitz')).toBe(true);
    expect(isCategorySelected(session, 'free_bullet')).toBe(true);
    expect(isCategoryLineVisible(session, 'free_blitz')).toBe(true);
    expect(isCategoryLineVisible(session, 'free_bullet')).toBe(true);
    expect(session.heroRevealedIds).toEqual(expect.arrayContaining(['free_blitz', 'free_bullet']));
    session = toggle(session, 'free_rapid');
    expect(session.activeReveal?.kind).toBe('hero');
    expect(session.activeReveal?.serial).not.toBe(serial);
  });

  test('viewport settle matches lane settle and does not reset the session', () => {
    let session = toggle(createLandscapeTickerSession(), 'tournament');
    session = complete(session);
    session = toggle(session, 'free_rapid');
    session = reduceLandscapeTickerSession(session, { type: 'settleForViewportChange' });
    expect(session.activeReveal).toBeNull();
    expect(session.selectedIds).toEqual(['tournament', 'free_rapid']);
    expect(session.heroRevealedIds).toEqual(expect.arrayContaining(['tournament', 'free_rapid']));
  });

  test('landscape overlay keeps dialog, lane tabs, safe area, and mobile scope', () => {
    const drawer = src('components/profile/ratings/ExpandedRatingTickerDrawer.tsx');
    expect(drawer).toContain('expanded-rating-ticker-drawer');
    expect(drawer).toContain('RatingLaneTabs');
    expect(drawer).toContain('filterPointsByLane');
    expect(drawer).toContain('lanePoints');
    expect(drawer).toContain('safe-area-inset-top');
    expect(drawer).toContain('landscape-ticker-orientation-hint');
    expect(drawer).toContain('max-h-[100dvh]');
    expect(src('lib/profile/landscapeTickerDialogChrome.ts')).toContain(
      "document.body.style.overflow = 'hidden'",
    );
    expect(drawer).not.toContain('sm:hidden');
    expect(src('components/profile/ratings/RatingTrackDetailPanel.tsx')).toContain('expandMobile');
    expect(src('components/profile/ratings/RatingTrackDetailPanel.tsx')).not.toContain('sm:hidden');
    expect(src('components/profile/ratings/RatingFamilyComparisonPanel.tsx')).toContain('expandMobile');
    expect(src('components/profile/ratings/RatingFamilyComparisonPanel.tsx')).not.toContain('sm:hidden');
    expect(src('components/profile/ratings/landscapeRatingTicker.module.css')).toContain('.expandMobile');
    expect(src('components/profile/ratings/landscapeRatingTicker.module.css')).toContain(
      "[data-landscape-fit='true']",
    );
    expect(src('components/profile/ratings/landscapeRatingTicker.module.css')).not.toContain(
      '@media (orientation: landscape) and (max-height: 500px)',
    );
    expect(src('lib/profile/landscapeTickerViewport.ts')).toContain('subscribeVisualViewport');
    expect(drawer).toContain('subscribeVisualViewport');
    expect(drawer).toContain('isLandscapeFitBox');
    expect(src('lib/profile/landscapeTickerMotion.ts')).toContain('cssSupportsOffsetPath');
    expect(src('components/profile/ratings/LandscapeRatingTickerChart.tsx')).toContain(
      'cssSupportsOffsetPath',
    );
    expect(src('components/profile/ratings/landscapeRatingTicker.module.css')).toContain(
      'landscapeTickerHead',
    );
  });

  test('family pager registry is Free, Battlefield, KPTV without invented ticker series', () => {
    expect(LANDSCAPE_TICKER_FAMILIES.map((f) => f.id)).toEqual(['free', 'battlefield', 'kptv']);
    expect(LANDSCAPE_TICKER_FAMILIES.map((f) => f.tickerName)).toEqual([
      'Free ticker',
      'Battlefield ticker',
      'KPTV ticker',
    ]);
    expect(LANDSCAPE_TICKER_FAMILIES[2].label).toBe('KPTV');
    expect(LANDSCAPE_TICKER_DEFAULT_FAMILY).toBe('free');
    expect(LANDSCAPE_TICKER_FAMILIES.find((f) => f.id === 'free')?.implemented).toBe(true);
    expect(LANDSCAPE_TICKER_FAMILIES.find((f) => f.id === 'battlefield')?.implemented).toBe(false);
    expect(LANDSCAPE_TICKER_FAMILIES.find((f) => f.id === 'kptv')?.implemented).toBe(false);
    expect(adjacentLandscapeTickerFamily('free', 1)).toBe('battlefield');
    expect(adjacentLandscapeTickerFamily('kptv', 1)).toBe('free');
    expect(JSON.stringify(LANDSCAPE_TICKER_FAMILIES)).not.toMatch(/Kids|K-12|K12|kindergarten/i);
  });
});
