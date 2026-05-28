import { expect, test } from '@playwright/test';

import { buildRatingHistoryPointsForTrack } from '../../lib/profileRatingHistoryBuild';
import { buildRatingHistoryPointsFromLedger, type RatingHistoryLedgerRow } from '../../lib/ratingHistoryLedgerBuild';

function preferLedger(
  ledgerRows: RatingHistoryLedgerRow[],
  games: Parameters<typeof buildRatingHistoryPointsForTrack>[0],
  playerId: string,
  trackId: string,
) {
  const fromLedger = buildRatingHistoryPointsFromLedger(ledgerRows, playerId, trackId);
  const fromGames = buildRatingHistoryPointsForTrack(games, playerId, trackId);
  return fromLedger.length > 0 ? fromLedger : fromGames;
}

test.describe('profile rating ledger integration', () => {
  test('prefers ledger when available', () => {
    const points = preferLedger(
      [
        {
          id: 'l1',
          player_id: 'u1',
          rating_track_id: 'free_blitz',
          ecosystem: 'free',
          rating_scope: 'mode',
          mode: 'blitz',
          time_control: '5m',
          badge_track_key: null,
          event_type: 'game',
          game_id: 'g-ledger',
          tournament_id: null,
          bracket_id: null,
          opponent_id: null,
          opponent_username: null,
          result: 'win',
          rating_before: 1600,
          rating_after: 1610,
          rating_delta: 10,
          occurred_at: '2026-05-10T12:00:00Z',
          badge_state_before: null,
          badge_state_after: null,
          badge_event: null,
          streak_before: null,
          streak_after: null,
          is_backfilled: false,
          metadata: {},
        },
      ],
      [
        {
          id: 'g-fallback',
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
          },
          result: 'white_win',
        },
      ],
      'u1',
      'free_blitz',
    );
    expect(points).toHaveLength(1);
    expect(points[0].gameId).toBe('g-ledger');
    expect(points[0].ratingBefore).toBe(1600);
  });

  test('falls back to rating_last_update when ledger empty', () => {
    const points = preferLedger(
      [],
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
    expect(points[0].gameId).toBe('g2');
  });

  test('does not fabricate when neither source has data', () => {
    const points = preferLedger([], [], 'u1', 'free_rapid');
    expect(points).toHaveLength(0);
  });

  test('visitor path uses empty ledger (no leak)', () => {
    const isSelf = false;
    const ledgerRows: RatingHistoryLedgerRow[] = [];
    const historyByTrack = isSelf ? { free_blitz: buildRatingHistoryPointsFromLedger(ledgerRows, 'u1', 'free_blitz') } : {};
    expect(historyByTrack).toEqual({});
  });
});
