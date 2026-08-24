import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MAJOR_FAMILY_COMPARISON_SERIES } from '../../lib/profileRatingChartLevels';
import {
  applyActivationToggle,
  frontMostId,
  initialDominanceOrder,
  moveIdToFront,
  removeIdFromOrder,
  sortItemsByDominance,
} from '../../lib/profile/ratingLineDominanceOrder';
import { LANDSCAPE_TICKER_CROSSING_HISTORY, landscapeTickerCrossingHits } from '../helpers/landscapeTickerCrossingFixture';
import { COMPACT_COMPARISON_CHART, compactComparisonDomain, compactCrossingAgrees } from '../helpers/compactComparisonGeometry';

const root = process.cwd();

function src(rel: string): string {
  return readFileSync(join(root, ...rel.split('/')), 'utf8');
}

test.describe('compact comparison activation dominance (unit)', () => {
  test('initial ordering is deterministic registry order', () => {
    const ids = MAJOR_FAMILY_COMPARISON_SERIES.map((s) => s.trackId);
    expect(initialDominanceOrder(ids)).toEqual([
      'tournament',
      'free_bullet',
      'free_blitz',
      'free_rapid',
      'free_day',
    ]);
    expect(frontMostId(initialDominanceOrder(ids))).toBe('free_day');
  });

  test('Tournament then Rapid then Blitz paints back-to-front in that order', () => {
    let order = initialDominanceOrder<string>(['tournament']);
    order = moveIdToFront(order, 'free_rapid');
    order = moveIdToFront(order, 'free_blitz');
    expect(order).toEqual(['tournament', 'free_rapid', 'free_blitz']);
    expect(frontMostId(order)).toBe('free_blitz');
  });

  test('deselect Rapid then reselect moves Rapid to the front', () => {
    let order = ['tournament', 'free_rapid', 'free_blitz'] as const;
    const afterHide = applyActivationToggle([...order], 'free_rapid', false);
    expect(afterHide).toEqual(['tournament', 'free_blitz']);
    expect(frontMostId(afterHide)).toBe('free_blitz');
    const afterReselect = applyActivationToggle(afterHide, 'free_rapid', true);
    expect(afterReselect).toEqual(['tournament', 'free_blitz', 'free_rapid']);
    expect(frontMostId(afterReselect)).toBe('free_rapid');
  });

  test('removing the dominant category exposes the next-most-recent', () => {
    const order = ['free_blitz', 'free_rapid', 'free_day'] as const;
    const withoutDaily = removeIdFromOrder(order, 'free_day');
    expect(withoutDaily).toEqual(['free_blitz', 'free_rapid']);
    expect(frontMostId(withoutDaily)).toBe('free_rapid');
  });

  test('sort paints back-most first and front-most last', () => {
    const series = [
      { trackId: 'free_day' },
      { trackId: 'free_blitz' },
      { trackId: 'free_rapid' },
    ];
    expect(
      sortItemsByDominance(series, ['free_blitz', 'free_rapid', 'free_day'], (s) => s.trackId).map(
        (s) => s.trackId,
      ),
    ).toEqual(['free_blitz', 'free_rapid', 'free_day']);
  });

  test('category-button order stays the fixed registry order', () => {
    expect(MAJOR_FAMILY_COMPARISON_SERIES.map((s) => s.label)).toEqual([
      'Tournament',
      'Bullet',
      'Blitz',
      'Rapid',
      'Daily',
    ]);
    const panel = src('components/profile/ratings/RatingFamilyComparisonPanel.tsx');
    expect(panel).toContain('MAJOR_FAMILY_COMPARISON_SERIES.map((def)');
    expect(panel).not.toContain('dominanceOrder.map((def)');
  });

  test('rating values, chronology, and compact axis math stay independent of dominance', () => {
    expect(LANDSCAPE_TICKER_CROSSING_HISTORY.free_blitz.map((p) => p.ratingAfter)).toEqual([
      1600, 1400, 1600,
    ]);
    expect(LANDSCAPE_TICKER_CROSSING_HISTORY.free_rapid.map((p) => p.occurredAt)).toEqual(
      LANDSCAPE_TICKER_CROSSING_HISTORY.free_blitz.map((p) => p.occurredAt),
    );
    const domain = compactComparisonDomain(['free_blitz', 'free_rapid', 'free_day']);
    expect(domain.minR).toBe(1400);
    expect(domain.maxR).toBe(1600);
    const chart = src('components/profile/ratings/MultiLineRatingTickerChart.tsx');
    expect(chart).toContain('export const MULTI_LINE_CHART_W = 560');
    expect(chart).toContain('export const MULTI_LINE_CHART_H = 180');
    expect(chart).toContain('export const MULTI_LINE_CHART_PAD = 20');
    expect(COMPACT_COMPARISON_CHART).toEqual({ width: 560, height: 180, pad: 20 });
    const hits = landscapeTickerCrossingHits().filter((h) => h.a === 'free_blitz' && h.b === 'free_rapid');
    expect(hits.length).toBe(2);
    expect(hits.every((h) => compactCrossingAgrees(h))).toBe(true);
    expect(chart).toContain('sortItemsByDominance');
    expect(chart).not.toContain('applyFreePlayRatingUpdate');
  });

  test('compact chart has no hero animation or landscape session reducer', () => {
    const chart = src('components/profile/ratings/MultiLineRatingTickerChart.tsx');
    const panel = src('components/profile/ratings/RatingFamilyComparisonPanel.tsx');
    const helper = src('lib/profile/ratingLineDominanceOrder.ts');
    expect(chart).toContain('data-hero="false"');
    expect(chart).not.toContain('heroGlow');
    expect(chart).not.toContain('heroCore');
    expect(chart).not.toContain('pendingActivations');
    expect(chart).not.toContain('startReveal');
    expect(chart).not.toContain('createLandscapeTickerSession');
    expect(panel).not.toContain('createLandscapeTickerSession');
    expect(helper).not.toContain('hero');
    expect(helper).not.toContain('pendingActivations');
    expect(src('lib/profile/landscapeTickerSession.ts')).toContain('function moveToFront');
  });

  test('legacy comparison overlay is gone; both Expand buttons share one landscape drawer', () => {
    const panel = src('components/profile/ratings/RatingFamilyComparisonPanel.tsx');
    const detail = src('components/profile/ratings/RatingTrackDetailPanel.tsx');
    expect(existsSync(join(root, 'components/profile/ratings/ExpandedRatingComparisonDrawer.tsx'))).toBe(
      false,
    );
    expect(panel).toContain('ExpandedRatingTickerDrawer');
    expect(panel).toContain('rating-comparison-expand-mobile');
    expect(panel).toContain('dominanceOrder={dominanceOrder}');
    expect(detail).toContain('ExpandedRatingTickerDrawer');
    expect(detail).toContain('rating-ticker-expand-mobile');
  });
});
