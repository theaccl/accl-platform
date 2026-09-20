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
      p1_bucket: 'tournament_unified',
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
          rating_last_update: {
            p1_bucket: 'free_blitz',
            p1_white: { before: 1600, after: 1610, delta: 10 },
          },
        }),
      ],
      'u1',
      'free_blitz',
    );
    expect(points).toHaveLength(1);
  });

  test('shared legacy free_live snapshots do not become Blitz or Rapid history', () => {
    const legacyBlitz = game({
      id: 'g-legacy-blitz',
      play_context: 'free',
      live_time_control: '5m',
      rating_last_update: {
        bucket: 'free_live',
        applied: true,
        white: { before: 1500, after: 1510, delta: 10 },
        black: { before: 1500, after: 1490, delta: -10 },
      },
    });
    const legacyRapid = game({
      ...legacyBlitz,
      id: 'g-legacy-rapid',
      live_time_control: '10m',
    });
    for (const player of ['u1', 'u2']) {
      expect(buildRatingHistoryPointsForTrack([legacyBlitz], player, 'free_blitz')).toEqual([]);
      expect(buildRatingHistoryPointsForTrack([legacyRapid], player, 'free_rapid')).toEqual([]);
    }
  });

  test('snapshot P1 bucket must agree with the game time control', () => {
    const mismatched = game({
      id: 'g-mismatch',
      play_context: 'free',
      live_time_control: '5m',
      rating_last_update: {
        p1_bucket: 'free_rapid',
        p1_white: { before: 1500, after: 1510, delta: 10 },
      },
    });
    expect(buildRatingHistoryPointsForTrack([mismatched], 'u1', 'free_blitz')).toEqual([]);
  });

  test('a P1 bucket cannot borrow a missing side rating from the legacy bucket', () => {
    const mixed = game({
      id: 'g-mixed',
      play_context: 'free',
      live_time_control: '5m',
      rating_last_update: {
        bucket: 'free_live',
        p1_bucket: 'free_blitz',
        white: { before: 1600, after: 1610, delta: 10 },
      },
    });
    expect(buildRatingHistoryPointsForTrack([mixed], 'u1', 'free_blitz')).toEqual([]);
  });

  test('modern P1 snapshots retain the Black player\'s mode history', () => {
    const modern = game({
      id: 'g-modern-black',
      play_context: 'free',
      live_time_control: '5m',
      rating_last_update: {
        bucket: 'free_live',
        p1_bucket: 'free_blitz',
        black: { before: 1800, after: 1810, delta: 10 },
        p1_black: { before: 1500, after: 1490, delta: -10 },
      },
    });
    const points = buildRatingHistoryPointsForTrack([modern], 'u2', 'free_blitz');
    expect(points).toHaveLength(1);
    expect(points[0].ratingBefore).toBe(1500);
    expect(points[0].ratingAfter).toBe(1490);
  });
});
