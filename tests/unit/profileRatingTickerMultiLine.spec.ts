import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { finishedGameHref } from '../../lib/profileRatingFinishedLinks';
import { MAJOR_FAMILY_COMPARISON_SERIES } from '../../lib/profileRatingChartLevels';

const root = process.cwd();

function src(rel: string): string {
  return readFileSync(join(root, ...rel.split('/')), 'utf8');
}

test.describe('profile rating ticker multi-line (unit)', () => {
  test('dashboard wires comparison panel for self without altering single-track panel', () => {
    const dash = src('components/profile/ratings/ProfileRatingsDashboard.tsx');
    expect(dash).toContain('RatingTrackDetailPanel');
    expect(dash).toContain('RatingFamilyComparisonPanel');
    expect(dash).toContain('isSelf ? (');
    expect(dash).toContain('historyByTrack={dashboard.historyByTrack}');
    expect(dash).not.toContain("historyByTrack['accl']");
  });

  test('comparison panel renders five families with legend hide/show and lane tabs', () => {
    const panel = src('components/profile/ratings/RatingFamilyComparisonPanel.tsx');
    expect(panel).toContain('MAJOR_FAMILY_COMPARISON_SERIES');
    expect(panel).toContain('data-testid="major-family-legend"');
    expect(panel).toContain('data-visible');
    expect(panel).toContain('RatingLaneTabs');
    expect(panel).toContain("testIdPrefix=\"comparison\"");
    expect(panel).toContain('ExpandedRatingTickerDrawer');
    expect(panel).not.toContain('ExpandedRatingComparisonDrawer');
    expect(panel).toContain('data-testid={def.legendTestId}');
    expect(MAJOR_FAMILY_COMPARISON_SERIES).toHaveLength(5);
  });

  test('multi-line chart uses finished-game links and does not synthesize points', () => {
    const chart = src('components/profile/ratings/MultiLineRatingTickerChart.tsx');
    expect(chart).toContain('finishedGameHref');
    expect(chart).toContain('finishedGameTrainHref');
    expect(chart).toContain('data-testid="multi-line-rating-chart"');
    expect(chart).toContain('pointsAtExactTimestamp');
    expect(chart).not.toContain('interpolat');
    expect(chart).not.toContain('synthetic');
  });

  test('tournament series uses gold stroke color in registry', () => {
    const tournament = MAJOR_FAMILY_COMPARISON_SERIES.find((s) => s.trackId === 'tournament');
    expect(tournament?.color).toBe('#eab308');
    const chart = src('components/profile/ratings/MultiLineRatingTickerChart.tsx');
    expect(chart).toContain('stroke={s.color}');
  });

  test('comparison expand uses the landscape ticker without a second overlay', () => {
    const panel = src('components/profile/ratings/RatingFamilyComparisonPanel.tsx');
    const singleDrawer = src('components/profile/ratings/ExpandedRatingTickerDrawer.tsx');
    expect(panel).toContain('rating-comparison-expand-mobile');
    expect(panel).toContain('ExpandedRatingTickerDrawer');
    expect(panel).toContain('historyByTrack={historyByTrack}');
    expect(panel).not.toContain('ExpandedRatingComparisonDrawer');
    expect(panel).toContain('visibleTrackIds={visibleTrackIds}');
    expect(singleDrawer).toContain('expanded-rating-ticker-drawer');
    expect(singleDrawer).toContain('RatingLaneTabs');
    expect(singleDrawer).toContain('LandscapeRatingTickerChart');
    expect(singleDrawer).not.toContain('MultiLineRatingTickerChart');
  });

  test('click on game-linked point uses finished-game route helper', () => {
    expect(finishedGameHref('game-abc')).toBe('/finished/game-abc');
    const chart = src('components/profile/ratings/MultiLineRatingTickerChart.tsx');
    expect(chart).toContain('data-testid="multi-line-finished-link"');
    expect(chart).toContain('activePoint.point.gameId');
  });

  test('legend toggle hides series via visibleTrackIds', () => {
    const panel = src('components/profile/ratings/RatingFamilyComparisonPanel.tsx');
    expect(panel).toContain('toggleTrack');
    expect(panel).toContain('visibleTrackIds');
    const chart = src('components/profile/ratings/MultiLineRatingTickerChart.tsx');
    expect(chart).toContain('visibleTrackIds.has');
    expect(chart).toContain('dominanceOrder');
    expect(chart).toContain('sortItemsByDominance');
    expect(chart).not.toContain('heroGlow');
    expect(chart).not.toContain('pendingActivations');
  });
});
