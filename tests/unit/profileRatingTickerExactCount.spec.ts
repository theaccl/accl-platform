import { expect, test } from '@playwright/test';

import { modeOverallRatingTrackId, visibleTimeControlsForMode } from '../../lib/acclTimeControls';
import {
  countExactTrackRatedGames,
  countModeOverallRatedGames,
  mergeAuthoritativeTrackGameCounts,
} from '../../lib/profileRatingTrackGameCounts';
import { subtracksForMode } from '../../lib/profileRatingTracks';
import type { RatingHistoryLedgerRow } from '../../lib/ratingHistoryLedgerBuild';

function modeLedgerRow(
  gameId: string,
  trackId: string,
  badgeKey: string | null,
  scope: 'mode' | 'exact_time_control',
  mode: string,
  lc: string,
): RatingHistoryLedgerRow {
  return {
    id: `l-${gameId}-${trackId}`,
    player_id: 'u1',
    rating_track_id: trackId,
    ecosystem: 'free',
    rating_scope: scope,
    mode,
    time_control: lc,
    badge_track_key: badgeKey,
    event_type: 'game',
    game_id: gameId,
    tournament_id: null,
    bracket_id: null,
    opponent_id: null,
    opponent_username: null,
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
  };
}

test.describe('exact subtrack game counts (global)', () => {
  const ledger31 = Array.from({ length: 31 }, (_, i) =>
    modeLedgerRow(`g${i}`, 'free_rapid', null, 'mode', 'rapid', '10m'),
  );

  test('Rapid Overall aggregates mode-scope games; exact subtracks do not inherit 31', () => {
    const counts = mergeAuthoritativeTrackGameCounts(ledger31, [], 'u1', []);
    expect(counts.free_rapid).toBe(31);
    expect(counts.free_rapid_10_0).toBe(0);
    expect(counts.free_rapid_15_0).toBe(0);
    expect(counts.free_rapid_30_0).toBe(0);
    expect(counts.free_rapid_60_0).toBe(0);
  });

  test('exact track counts only its own exact ledger rows', () => {
    const ledger = [
      ...ledger31,
      modeLedgerRow('x1', 'free_rapid_15_0', 'rapid_15_0', 'exact_time_control', 'rapid', '15m'),
      modeLedgerRow('x2', 'free_rapid_15_0', 'rapid_15_0', 'exact_time_control', 'rapid', '15m'),
    ];
    expect(countModeOverallRatedGames(ledger, [], 'u1', 'rapid')).toBe(31);
    expect(countExactTrackRatedGames(ledger, [], 'u1', 'free_rapid_15_0')).toBe(2);
    expect(countExactTrackRatedGames(ledger, [], 'u1', 'free_rapid_10_0')).toBe(0);
  });

  test('Bullet / Blitz / Daily: overall vs exact separation', () => {
    const bulletLedger = [
      modeLedgerRow('b1', 'free_bullet', null, 'mode', 'bullet', '2m'),
      modeLedgerRow('b2', 'free_bullet', null, 'mode', 'bullet', '3m'),
      modeLedgerRow('b3', 'free_bullet_2_0', 'bullet_2_0', 'exact_time_control', 'bullet', '2m'),
    ];
    const blitzLedger = [
      modeLedgerRow('z1', 'free_blitz', null, 'mode', 'blitz', '5m'),
      modeLedgerRow('z2', 'free_blitz_5_5', 'blitz_5_5', 'exact_time_control', 'blitz', '5+5'),
    ];
    const dailyLedger = [
      modeLedgerRow('d1', 'free_day', null, 'mode', 'daily', '7d'),
      modeLedgerRow('d2', 'free_daily_7d', 'daily_7_day', 'exact_time_control', 'daily', '7d'),
    ];

    expect(countModeOverallRatedGames(bulletLedger, [], 'u1', 'bullet')).toBe(2);
    expect(countExactTrackRatedGames(bulletLedger, [], 'u1', 'free_bullet_2_0')).toBe(1);
    expect(countExactTrackRatedGames(bulletLedger, [], 'u1', 'free_bullet_1_0')).toBe(0);

    expect(countModeOverallRatedGames(blitzLedger, [], 'u1', 'blitz')).toBe(1);
    expect(countExactTrackRatedGames(blitzLedger, [], 'u1', 'free_blitz_5_5')).toBe(1);
    expect(countExactTrackRatedGames(blitzLedger, [], 'u1', 'free_blitz_3_0')).toBe(0);

    expect(countModeOverallRatedGames(dailyLedger, [], 'u1', 'daily')).toBe(1);
    expect(countExactTrackRatedGames(dailyLedger, [], 'u1', 'free_daily_7d')).toBe(1);
    expect(countExactTrackRatedGames(dailyLedger, [], 'u1', 'free_daily_1d')).toBe(0);
  });

  test('subtracksForMode never copies parent modeGames onto exact rows', () => {
    const counts = mergeAuthoritativeTrackGameCounts(ledger31, [], 'u1', []);
    const subtracks = subtracksForMode('rapid', 1500, 31, undefined, counts);
    const overall = subtracks.find((s) => s.isOverall);
    const rapid10 = subtracks.find((s) => s.ratingTrackId === 'free_rapid_10_0');
    const rapid15 = subtracks.find((s) => s.ratingTrackId === 'free_rapid_15_0');
    expect(overall?.gamesPlayed).toBe(31);
    expect(rapid10?.gamesPlayed).toBe(0);
    expect(rapid15?.gamesPlayed).toBe(0);
  });

  test('clean display labels unchanged', () => {
    expect(visibleTimeControlsForMode('bullet').find((t) => t.id === 'bullet_2_0')?.displayValue).toBe(
      '2',
    );
    expect(visibleTimeControlsForMode('rapid').map((t) => t.displayValue)).toEqual([
      '10',
      '15',
      '30',
      '60',
    ]);
    expect(modeOverallRatingTrackId('rapid')).toBe('free_rapid');
  });
});
