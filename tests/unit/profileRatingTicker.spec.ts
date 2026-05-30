import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildRatingHistoryPointsForTrack } from '../../lib/profileRatingHistoryBuild';
import { topLevelRatingCardsFromP1 } from '../../lib/profileRatingTracks';

test.describe('profile rating ticker (unit)', () => {
  test('top-level cards use ACCL + tournament + four modes', () => {
    const cards = topLevelRatingCardsFromP1({
      accl_rating: 1600,
      tournament_rating: 1600,
      tournament_unified: { rating: 1600, games_played: 3 },
      free_bullet: { rating: 1500, games_played: 1 },
      free_blitz: { rating: 1500, games_played: 2 },
      free_rapid: { rating: 1500, games_played: 0 },
      free_day: { rating: 1500, games_played: 0 },
    });
    expect(cards.map((c) => c.label)).toEqual([
      'ACCL Rating',
      'Tournament Rating',
      'Bullet',
      'Blitz',
      'Rapid',
      'Daily',
    ]);
  });

  test('buildRatingHistoryPointsForTrack does not fabricate points', () => {
    const points = buildRatingHistoryPointsForTrack(
      [
        {
          id: 'g1',
          finished_at: '2026-05-01T12:00:00Z',
          white_player_id: 'u1',
          black_player_id: 'u2',
          play_context: 'free',
          tempo: 'live',
          live_time_control: '5m',
          rated: true,
          rating_applied: false,
          rating_last_update: null,
          result: 'white_win',
        },
      ],
      'u1',
      'free_blitz',
    );
    expect(points).toHaveLength(0);
  });

  test('buildRatingHistoryPointsForTrack uses p1 snapshot when applied', () => {
    const points = buildRatingHistoryPointsForTrack(
      [
        {
          id: 'g2',
          finished_at: '2026-05-02T12:00:00Z',
          white_player_id: 'u1',
          black_player_id: 'u2',
          play_context: 'free',
          tempo: 'live',
          live_time_control: '5m',
          rated: true,
          rating_applied: true,
          rating_last_update: {
            p1_bucket: 'free_blitz',
            p1_white: { before: 1500, after: 1510, delta: 10 },
            p1_black: { before: 1500, after: 1490, delta: -10 },
          },
          result: 'white_win',
        },
      ],
      'u1',
      'free_blitz',
    );
    expect(points).toHaveLength(1);
    expect(points[0].ratingBefore).toBe(1500);
    expect(points[0].ratingAfter).toBe(1510);
    expect(points[0].gameId).toBe('g2');
  });

  test('profile page wires dashboard test id', () => {
    const src = readFileSync(join(process.cwd(), 'components', 'profile', 'ProfileRatings.tsx'), 'utf8');
    expect(src).toContain('ProfileRatingsDashboard');
    const page = readFileSync(join(process.cwd(), 'app', 'profile', '[id]', 'page.tsx'), 'utf8');
    expect(page).toContain('profileUserId');
    expect(page).toContain('ProfileRatings');
  });

  test('Nexus does not own profile rating dashboard', () => {
    const nexus = readFileSync(join(process.cwd(), 'app', 'nexus', 'page.tsx'), 'utf8');
    expect(nexus).not.toContain('profile-rating-dashboard');
    expect(nexus).not.toContain('RatingTickerChart');
  });

  test('detail panel uses ACCL lane tabs, headline metrics, and result filters', () => {
    const panel = readFileSync(
      join(process.cwd(), 'components', 'profile', 'ratings', 'RatingTrackDetailPanel.tsx'),
      'utf8',
    );
    expect(panel).toContain('filterPointsByLane');
    expect(panel).toContain('filterPointsByResult');
    expect(panel).toContain('summarizeLaneMetrics');
    expect(panel).toContain('rating-lane-tabs');
    expect(panel).toContain('rating-lane-tab-');
    expect(panel).toContain('rating-metric-row');
    expect(panel).toContain('rating-result-filter');
    // mobile-safe lane row: horizontal scroll, no wrap
    expect(panel).toContain('overflow-x-auto');
    expect(panel).toContain('whitespace-nowrap');
  });

  test('lane doctrine uses Day/Week/Month/Year/Overall, never 7D/30D/90D/1Y/ALL', () => {
    const metrics = readFileSync(join(process.cwd(), 'lib', 'ratingHistoryMetrics.ts'), 'utf8');
    for (const label of ["'Day'", "'Week'", "'Month'", "'Year'", "'Overall'"]) {
      expect(metrics).toContain(label);
    }
    for (const banned of ['7D', '30D', '90D', '1Y']) {
      expect(metrics).not.toContain(banned);
    }
    expect(metrics).not.toContain('@supabase'); // pure helper, no data layer
  });

  test('ticker chart adds peak/low/current markers and badge-event hook without recharts', () => {
    const chart = readFileSync(
      join(process.cwd(), 'components', 'profile', 'ratings', 'RatingTickerChart.tsx'),
      'utf8',
    );
    expect(chart).toContain('rating-ticker-current-pill');
    expect(chart).toContain('rating-ticker-peak-marker');
    expect(chart).toContain('rating-ticker-low-marker');
    expect(chart).toContain('data-badge-event');
    expect(chart).not.toContain('recharts');
  });

  test('new honest empty states exist with approved copy', () => {
    const es = readFileSync(
      join(process.cwd(), 'components', 'profile', 'ratings', 'ratingTickerEmptyStates.ts'),
      'utf8',
    );
    expect(es).toContain('No rating movement in this lane yet.');
    expect(es).toContain('More rated games are needed before this chart can be drawn.');
    expect(es).toContain('No rated games yet.');
  });

  test('detailed rating history stays self-only (public history hidden)', () => {
    const loader = readFileSync(join(process.cwd(), 'lib', 'loadProfileRatingDashboard.ts'), 'utf8');
    expect(loader).toContain('if (!isSelf)');
    expect(loader).toContain('historyByTrack: {}');
  });
});
