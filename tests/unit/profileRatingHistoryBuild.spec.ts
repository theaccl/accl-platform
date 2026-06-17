import { expect, test } from '@playwright/test';

import {
  buildRatingHistoryPointsForTrack,
  type ProfileHistoryGameRow,
} from '../../lib/profileRatingHistoryBuild';

function game(
  partial: Partial<ProfileHistoryGameRow> & Pick<ProfileHistoryGameRow, 'id'>,
): ProfileHistoryGameRow {
  return {
    finished_at: '2026-05-01T12:00:00Z',
    white_player_id: 'u1',
    black_player_id: 'u2',
    play_context: 'tournament',
    tempo: 'live',
    live_time_control: '5m',
    rated: true,
    rating_applied: true,
    rating_last_update: {
      p1_white: { before: 1600, after: 1610, delta: 10 },
      p1_black: { before: 1500, after: 1490, delta: -10 },
    },
    result: 'white_win',
    ...partial,
  };
}

test.describe('profile rating history build (O1-A track separation)', () => {
  test('tournament track includes tournament_unified bucket games', () => {
    const points = buildRatingHistoryPointsForTrack([game({ id: 'g1' })], 'u1', 'tournament');
    expect(points).toHaveLength(1);
    expect(points[0].ratingTrackId).toBe('tournament');
  });

  test('accl track excludes tournament_unified bucket games', () => {
    const points = buildRatingHistoryPointsForTrack([game({ id: 'g1' })], 'u1', 'accl');
    expect(points).toHaveLength(0);
  });

  test('free_blitz track still matches blitz games', () => {
    const points = buildRatingHistoryPointsForTrack(
      [
        game({
          id: 'g2',
          play_context: 'free',
          tempo: 'live',
          live_time_control: '5m',
        }),
      ],
      'u1',
      'free_blitz',
    );
    expect(points).toHaveLength(1);
  });
});
