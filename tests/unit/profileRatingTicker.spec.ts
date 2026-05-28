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
});
