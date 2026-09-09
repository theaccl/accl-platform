import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { filterPointsByLane } from '../../lib/ratingHistoryMetrics';
import { filterMajorFamilySeriesByLane } from '../../lib/profileRatingFamilyComparison';
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

test.describe('profile rating ticker lane tabs (unit)', () => {
  test('shared RatingLaneTabs renders rating and comparison test ids', () => {
    const tabs = src('components/profile/ratings/RatingLaneTabs.tsx');
    expect(tabs).toContain('rating-lane-tabs');
    expect(tabs).toContain('comparison-lane-tabs');
    expect(tabs).toContain('rating-lane-tab-');
    expect(tabs).toContain('comparison-lane-tab-');
    expect(tabs).toContain('data-selected');
  });

  test('single-track desktop panel filters chart by lane without fabrication', () => {
    const panel = src('components/profile/ratings/RatingTrackDetailPanel.tsx');
    expect(panel).toContain('RatingLaneTabs');
    expect(panel).toContain('filterPointsByLane');
    expect(panel).toContain('rating-lane-empty');
    expect(panel).toContain('RATING_LANE_EMPTY');
    expect(panel).toContain('lane={lane}');
    expect(panel).not.toContain('interpolat');
    expect(panel).not.toContain('synthetic');
  });

  test('single-track mobile drawer inherits lane and filters chart and point list', () => {
    const drawer = src('components/profile/ratings/ExpandedRatingTickerDrawer.tsx');
    expect(drawer).toContain('RatingLaneTabs');
    expect(drawer).toContain('filterPointsByLane');
    expect(drawer).toContain('lane: RatingLane');
    expect(drawer).toContain('onLaneChange');
    expect(drawer).toContain('rating-ticker-point-list');
    expect(drawer).toContain('lanePoints');
  });

  test('comparison expand reuses landscape drawer lane controls instead of a second overlay', () => {
    const panel = src('components/profile/ratings/RatingFamilyComparisonPanel.tsx');
    const drawer = src('components/profile/ratings/ExpandedRatingTickerDrawer.tsx');
    expect(panel).toContain('ExpandedRatingTickerDrawer');
    expect(panel).toContain('onLaneChange={setLane}');
    expect(panel).not.toContain('ExpandedRatingComparisonDrawer');
    expect(drawer).toContain('RatingLaneTabs');
    expect(drawer).toContain('filterPointsByLane');
    expect(drawer).toContain('onLaneChange');
    expect(drawer).toContain('testIdPrefix="rating"');
  });

  test('inline comparison panel still uses shared lane tabs unchanged', () => {
    const panel = src('components/profile/ratings/RatingFamilyComparisonPanel.tsx');
    expect(panel).toContain('RatingLaneTabs');
    expect(panel).toContain('RatingLaneTabs');
    expect(panel).toContain("testIdPrefix=\"comparison\"");
    expect(panel).toContain('toggleTrack');
    expect(panel).toContain('visibleTrackIds');
    expect(panel).toContain('historyByTrack={historyByTrack}');
    expect(panel).toContain('onLaneChange={setLane}');
  });

  test('lane filter returns only real ledger points in window', () => {
    const now = Date.parse('2026-06-07T12:00:00Z');
    const old = point({ id: 'old', occurredAt: '2020-01-01T12:00:00Z' });
    const recent = point({ id: 'recent', occurredAt: '2026-06-07T10:00:00Z' });
    const dayOnly = filterPointsByLane([old, recent], 'day', now, 'UTC');
    expect(dayOnly.map((p) => p.id)).toEqual(['recent']);
    const overall = filterPointsByLane([old, recent], 'overall', now);
    expect(overall).toHaveLength(2);
  });

  test('empty lane uses honest copy constant', () => {
    const empty = src('components/profile/ratings/ratingTickerEmptyStates.ts');
    expect(empty).toContain('RATING_LANE_EMPTY');
    expect(empty).toContain('No rating movement in this lane yet');
  });

  test('comparison lane filter does not synthesize cross-family points', () => {
    const base = [
      {
        trackId: 'tournament' as const,
        label: 'Tournament',
        color: '#eab308',
        legendTestId: 'major-family-legend-tournament',
        points: [point({ id: 't1', ratingTrackId: 'tournament' })],
      },
      {
        trackId: 'free_bullet' as const,
        label: 'Bullet',
        color: '#f472b6',
        legendTestId: 'major-family-legend-bullet',
        points: [],
      },
    ];
    const filtered = filterMajorFamilySeriesByLane(base, 'overall');
    expect(filtered[0].points).toHaveLength(1);
    expect(filtered[1].points).toHaveLength(0);
  });
});
