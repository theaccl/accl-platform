import { expect, test } from '@playwright/test';

import { CANONICAL_CARDI_BOT_USER_ID } from '@/lib/bot/botIdentity';
import { buildPublicOpenSeatLobbyInventory } from '@/lib/fetchPublicOpenSeatLobbyInventory';
import {
  countPublicVisibleOpenSeatsByPlatMode,
  countPublicVisibleOpenSeatsForMode,
  filterPublicVisibleOpenSeats,
  type PublicOpenSeatLobbyRow,
  type PublicOpenSeatSeatedRow,
} from '@/lib/freeLobbyOpenSeatFilters';
import { openSeatRowHostSeatedConflictsInSameSlot } from '@/lib/freePlayQueueSlotConflict';
import { platBucketForOpenSeat } from '@/lib/platOpenSeatBucket';

function liveOpen(
  id: string,
  host: string,
  ltc: string,
  rated = true,
): PublicOpenSeatLobbyRow {
  return {
    id,
    white_player_id: host,
    black_player_id: null,
    tempo: 'live',
    live_time_control: ltc,
    created_at: '2026-01-01T00:00:00.000Z',
    rated,
    status: 'active',
    play_context: 'free',
    tournament_id: null,
  };
}

function dailyOpen(id: string, host: string, rated: boolean): PublicOpenSeatLobbyRow {
  return {
    id,
    white_player_id: host,
    black_player_id: null,
    tempo: 'daily',
    live_time_control: '1d',
    created_at: '2026-01-01T00:00:00.000Z',
    rated,
    status: 'active',
    play_context: 'free',
    tournament_id: null,
  };
}

function seated(
  id: string,
  white: string,
  black: string,
  ltc: string,
  rated = true,
): PublicOpenSeatSeatedRow {
  return {
    id,
    white_player_id: white,
    black_player_id: black,
    tempo: 'live',
    live_time_control: ltc,
    rated,
    status: 'active',
  };
}

test.describe('freeLobbyOpenSeatHubParity', () => {
  test('bot-hosted row excluded from hub and room counts', () => {
    const ghost = dailyOpen('ghost', CANONICAL_CARDI_BOT_USER_ID, false);
    const inventory = buildPublicOpenSeatLobbyInventory([ghost], []);
    expect(countPublicVisibleOpenSeatsByPlatMode(inventory.openCandidates, inventory.seatedForBusy).daily).toBe(0);
    expect(countPublicVisibleOpenSeatsForMode(inventory.openCandidates, inventory.seatedForBusy, 'daily')).toBe(0);
  });

  test('host-busy same-slot and rated-lane row excluded from hub and room', () => {
    const open = liveOpen('open', 'host-user', '10m', true);
    const busy = seated('busy', 'host-user', 'other', '10m', true);
    expect(openSeatRowHostSeatedConflictsInSameSlot(open, busy)).toBe(true);
    const inventory = buildPublicOpenSeatLobbyInventory([open], [busy]);
    expect(countPublicVisibleOpenSeatsByPlatMode(inventory.openCandidates, inventory.seatedForBusy).rapid).toBe(0);
    expect(countPublicVisibleOpenSeatsForMode(inventory.openCandidates, inventory.seatedForBusy, 'rapid')).toBe(0);
  });

  test('rated and unrated visible seats combine in hub totals', () => {
    const rated = dailyOpen('r', 'u1', true);
    const unrated = dailyOpen('u', 'u2', false);
    const inventory = buildPublicOpenSeatLobbyInventory([rated, unrated], []);
    expect(countPublicVisibleOpenSeatsByPlatMode(inventory.openCandidates, inventory.seatedForBusy).daily).toBe(2);
  });

  test('Bullet, Blitz, Rapid, and Daily canonical tokens bucket correctly', () => {
    const rows = [
      liveOpen('b1', 'u1', '1m'),
      liveOpen('b2', 'u2', '5m'),
      liveOpen('b3', 'u3', '10m'),
      dailyOpen('d', 'u4', true),
    ];
    const inventory = buildPublicOpenSeatLobbyInventory(rows, []);
    const counts = countPublicVisibleOpenSeatsByPlatMode(inventory.openCandidates, inventory.seatedForBusy);
    expect(counts.bullet).toBe(1);
    expect(counts.blitz).toBe(1);
    expect(counts.rapid).toBe(1);
    expect(counts.daily).toBe(1);
    for (const row of inventory.openCandidates) {
      expect(platBucketForOpenSeat(row.tempo, row.live_time_control)).not.toBeNull();
    }
  });

  test('hub count equals corresponding public-visible room inventory count per mode', () => {
    const rows = [
      liveOpen('r1', 'u1', '10m', true),
      liveOpen('r2', 'u2', '10m', false),
      liveOpen('b1', 'u3', '5m', true),
      dailyOpen('d1', 'u4', true),
    ];
    const inventory = buildPublicOpenSeatLobbyInventory(rows, []);
    const hub = countPublicVisibleOpenSeatsByPlatMode(inventory.openCandidates, inventory.seatedForBusy);
    for (const mode of ['bullet', 'blitz', 'rapid', 'daily'] as const) {
      expect(hub[mode]).toBe(
        countPublicVisibleOpenSeatsForMode(inventory.openCandidates, inventory.seatedForBusy, mode),
      );
      expect(hub[mode]).toBe(
        filterPublicVisibleOpenSeats(inventory.openCandidates, inventory.seatedForBusy, mode).length,
      );
    }
  });

  test('hub filter contract: unchecked busy host is hidden only after seated conflict rows are supplied', () => {
    // Filter-layer pin (controller ordering covered in freeLobbyOpenSeatSyncControllers).
    const open = liveOpen('open', 'busy-host', '10m', true);
    const busy = seated('busy', 'busy-host', 'other', '10m', true);
    expect(filterPublicVisibleOpenSeats([open], [], 'rapid')).toHaveLength(1);
    expect(filterPublicVisibleOpenSeats([open], [busy], 'rapid')).toHaveLength(0);
  });

  test('hub filter contract: non-conflicting seated rows do not hide an eligible open seat', () => {
    const open = liveOpen('open', 'free-host', '10m', true);
    const unrelated = seated('other', 'someone-else', 'x', '5m', true);
    expect(filterPublicVisibleOpenSeats([open], [unrelated], 'rapid')).toHaveLength(1);
  });
});
