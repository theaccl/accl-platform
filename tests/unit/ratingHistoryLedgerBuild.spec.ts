import { expect, test } from '@playwright/test';

import { timeControlByRatingTrackId } from '../../lib/acclTimeControls';
import { buildRatingHistoryPointsFromLedger, type RatingHistoryLedgerRow } from '../../lib/ratingHistoryLedgerBuild';

function row(partial: Partial<RatingHistoryLedgerRow> & Pick<RatingHistoryLedgerRow, 'id' | 'rating_track_id'>): RatingHistoryLedgerRow {
  return {
    player_id: 'u1',
    ecosystem: 'free',
    rating_scope: 'mode',
    mode: 'blitz',
    time_control: '5m',
    badge_track_key: null,
    event_type: 'game',
    game_id: 'g1',
    tournament_id: null,
    bracket_id: null,
    opponent_id: 'u2',
    opponent_username: 'opp',
    result: 'win',
    rating_before: 1500,
    rating_after: 1510,
    rating_delta: 10,
    occurred_at: '2026-05-01T12:00:00Z',
    badge_state_before: null,
    badge_state_after: null,
    badge_event: null,
    streak_before: null,
    streak_after: null,
    is_backfilled: false,
    metadata: {},
    ...partial,
  };
}

test.describe('rating history ledger builder', () => {
  test('empty ledger returns empty state', () => {
    expect(buildRatingHistoryPointsFromLedger([], 'u1', 'free_blitz')).toEqual([]);
  });

  test('one ledger point renders', () => {
    const points = buildRatingHistoryPointsFromLedger(
      [row({ id: 'l1', rating_track_id: 'free_blitz' })],
      'u1',
      'free_blitz',
    );
    expect(points).toHaveLength(1);
    expect(points[0].ratingDelta).toBe(10);
    expect(points[0].gameId).toBe('g1');
  });

  test('multiple ledger points render sorted', () => {
    const points = buildRatingHistoryPointsFromLedger(
      [
        row({ id: 'l2', rating_track_id: 'free_blitz', occurred_at: '2026-05-03T12:00:00Z' }),
        row({ id: 'l1', rating_track_id: 'free_blitz', occurred_at: '2026-05-01T12:00:00Z' }),
      ],
      'u1',
      'free_blitz',
    );
    expect(points.map((p) => p.id)).toEqual(['l1', 'l2']);
  });

  test('missing optional badge fields do not crash', () => {
    const points = buildRatingHistoryPointsFromLedger(
      [row({ id: 'l1', rating_track_id: 'free_blitz', badge_event: null })],
      'u1',
      'free_blitz',
    );
    expect(points[0].badgeEvent).toBe('none');
  });

  test('backfilled points carry metadata flag', () => {
    const points = buildRatingHistoryPointsFromLedger(
      [
        row({
          id: 'l1',
          rating_track_id: 'free_blitz',
          event_type: 'backfill',
          is_backfilled: true,
        }),
      ],
      'u1',
      'free_blitz',
    );
    expect(points[0].eventType).toBe('backfill');
    expect(points[0].metadata?.backfill).toBe(true);
  });

  test('accl profile track reads tournament ledger rows', () => {
    const points = buildRatingHistoryPointsFromLedger(
      [row({ id: 'l1', rating_track_id: 'tournament', ecosystem: 'tournament' })],
      'u1',
      'accl',
    );
    expect(points).toHaveLength(1);
  });

  test('exact subtrack filters by badge track key', () => {
    const trackId = 'free_bullet_2_0';
    const def = timeControlByRatingTrackId(trackId);
    expect(def?.badgeTrackKey).toBe('bullet_2_0');

    const points = buildRatingHistoryPointsFromLedger(
      [
        row({
          id: 'l1',
          rating_track_id: trackId,
          rating_scope: 'exact_time_control',
          mode: 'bullet',
          badge_track_key: 'bullet_2_0',
        }),
        row({
          id: 'l2',
          rating_track_id: 'free_blitz_5_0',
          rating_scope: 'exact_time_control',
          badge_track_key: 'blitz_5_0',
        }),
      ],
      'u1',
      trackId,
    );
    expect(points).toHaveLength(1);
    expect(points[0].ratingTrackId).toBe(trackId);
  });

  test('daily 7d ledger track maps from badge key', () => {
    const trackId = 'free_daily_7d';
    const def = timeControlByRatingTrackId(trackId);
    expect(def?.badgeTrackKey).toBe('daily_7_day');

    const points = buildRatingHistoryPointsFromLedger(
      [
        row({
          id: 'l1',
          rating_track_id: trackId,
          rating_scope: 'exact_time_control',
          mode: 'daily',
          badge_track_key: 'daily_7_day',
        }),
      ],
      'u1',
      trackId,
    );
    expect(points).toHaveLength(1);
  });
});
