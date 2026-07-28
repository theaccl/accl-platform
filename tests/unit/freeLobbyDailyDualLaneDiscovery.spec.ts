import { expect, test } from '@playwright/test';

import { openSeatMatchesRated } from '@/lib/freePlayOpenSeatsFilter';
import {
  dailyRoomUsesDualDiscoverySections,
  openByClockForDiscoveryLane,
} from '@/lib/freeLobbyDailyDiscoveryLayout';
import {
  countOpenSeatsByClockAndLane,
  formatModeRoomOpenClockTile,
} from '@/lib/lobbyModeClockActivity';
import { formatUserFacingQueueError } from '@/lib/userFacingQueueError';
import {
  RATED_DAILY_CAP_MESSAGE,
  UNRATED_DAILY_QUEUE_CAP_MESSAGE,
} from '@/lib/freePlayDailyConcurrency';
import { openSeatMatchesPlatClock } from '@/lib/freePlayOpenSeatsFilter';

function dailyRow(id: string, tc: string, rated: boolean) {
  return {
    id,
    tempo: 'daily' as const,
    live_time_control: tc,
    rated,
    white_player_id: 'host',
    black_player_id: null as string | null,
    status: 'active',
    play_context: 'free',
    tournament_id: null,
  };
}

test.describe('freeLobbyDailyDualLaneDiscovery', () => {
  test('daily room uses dual discovery; live modes do not', () => {
    expect(dailyRoomUsesDualDiscoverySections('daily')).toBe(true);
    expect(dailyRoomUsesDualDiscoverySections('rapid')).toBe(false);
    expect(dailyRoomUsesDualDiscoverySections('blitz')).toBe(false);
    expect(dailyRoomUsesDualDiscoverySections('bullet')).toBe(false);
  });

  test('rated rows only in rated slice; unrated only in unrated slice', () => {
    const rows = [
      dailyRow('r1', '1d', true),
      dailyRow('u1', '2d', false),
      dailyRow('r2', '3d', true),
    ];
    const ratedOnly = rows.filter((r) => openSeatMatchesRated(r, true));
    const unratedOnly = rows.filter((r) => openSeatMatchesRated(r, false));
    expect(ratedOnly.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(unratedOnly.map((r) => r.id)).toEqual(['u1']);
  });

  test('each discovery lane has independent 1D / 2D / 3D / 7D counts', () => {
    const rows = [
      dailyRow('a', '1d', true),
      dailyRow('b', '1d', true),
      dailyRow('c', '2d', false),
      dailyRow('d', '7d', false),
    ];
    const lanes = countOpenSeatsByClockAndLane('daily', rows);
    const ratedClocks = openByClockForDiscoveryLane(lanes, true)!;
    const unratedClocks = openByClockForDiscoveryLane(lanes, false)!;
    expect(ratedClocks['1d']).toEqual({ rated: 2, unrated: 0, total: 2 });
    expect(ratedClocks['2d']).toEqual({ rated: 0, unrated: 0, total: 0 });
    expect(unratedClocks['2d']).toEqual({ rated: 0, unrated: 1, total: 1 });
    expect(unratedClocks['7d']).toEqual({ rated: 0, unrated: 1, total: 1 });
    expect(formatModeRoomOpenClockTile('1D', ratedClocks['1d']!).compactDetail).toContain('Rated');
    expect(formatModeRoomOpenClockTile('2D', unratedClocks['2d']!).compactDetail).toContain('Unrated');
  });

  test('hub-style combined total still aggregates both lanes per clock', () => {
    const rows = [dailyRow('r', '1d', true), dailyRow('u', '1d', false)];
    const lanes = countOpenSeatsByClockAndLane('daily', rows);
    expect(lanes['1d']).toEqual({ rated: 1, unrated: 1, total: 2 });
  });

  test('create/find lane selection is independent of discovery lane filters', () => {
    const discoveryRated = true;
    const postRated = false;
    expect(discoveryRated).not.toBe(postRated);
    const rows = [dailyRow('r', '1d', true), dailyRow('u', '1d', false)];
    const ratedDiscovery = rows.filter(
      (r) => openSeatMatchesPlatClock(r, 'daily', '1d') && openSeatMatchesRated(r, discoveryRated),
    );
    const postSlice = rows.filter(
      (r) => openSeatMatchesPlatClock(r, 'daily', '1d') && openSeatMatchesRated(r, postRated),
    );
    expect(ratedDiscovery).toHaveLength(1);
    expect(postSlice).toHaveLength(1);
    expect(ratedDiscovery[0]!.id).toBe('r');
    expect(postSlice[0]!.id).toBe('u');
  });

  test('SQL cap tokens map to polished copy', () => {
    expect(formatUserFacingQueueError('free_play_daily_rated_cap')).toBe(RATED_DAILY_CAP_MESSAGE);
    expect(formatUserFacingQueueError('free_play_daily_unrated_waiting_cap')).toBe(
      UNRATED_DAILY_QUEUE_CAP_MESSAGE,
    );
  });
});
