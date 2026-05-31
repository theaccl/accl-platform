import { expect, test } from '@playwright/test';

import { CANONICAL_CARDI_BOT_USER_ID } from '@/lib/bot/botIdentity';
import { openSeatRowHostSeatedConflictsInSameSlot } from '@/lib/freePlayQueueSlotConflict';
import {
  countVisiblePublicOpenSeatsForSlice,
  filterPublicVisibleOpenSeats,
  isBotHostedPublicOpenSeat,
  openSeatExactControlDisplayLabel,
  partitionLobbyRowsForPublicOpen,
} from '@/lib/freeLobbyOpenSeatFilters';
import {
  countOpenSeatsByClockAndLane,
  formatModeRoomOpenClockTile,
} from '@/lib/lobbyModeClockActivity';

const CARDI_GHOST_ROW_ID = '63e67ea9-b0d9-42e0-9fa6-f76344c6475b';

function rapid10mRated(id: string, host: string) {
  return {
    id,
    white_player_id: host,
    black_player_id: null as string | null,
    tempo: 'live',
    live_time_control: '10m',
    rated: true,
    status: 'active',
  };
}

function rapid10mUnrated(id: string, host: string) {
  return { ...rapid10mRated(id, host), rated: false };
}

test.describe('freeLobbyLaneVisibility', () => {
  test('Rapid 10M Rated + Unrated → clock tile exposes both lanes', () => {
    const { openCandidates, seatedForBusy } = partitionLobbyRowsForPublicOpen([
      rapid10mRated('a', 'user-a'),
      rapid10mUnrated('b', 'user-b'),
    ]);
    const visible = filterPublicVisibleOpenSeats(openCandidates, seatedForBusy, 'rapid');
    const counts = countOpenSeatsByClockAndLane('rapid', visible);
    const tile = formatModeRoomOpenClockTile('10 min', counts['10m']!);
    expect(tile.lit).toBe(true);
    expect(tile.sublines).toEqual(['Rated — 1 open', 'Unrated — 1 open']);
    expect(tile.headline).toBe('10 min');
  });

  test('Rapid 10M Rated only → compact single-lane label', () => {
    const counts = countOpenSeatsByClockAndLane('rapid', [rapid10mRated('a', 'user-a')]);
    const tile = formatModeRoomOpenClockTile('10 min', counts['10m']!);
    expect(tile.compactDetail).toBe('10 min · Rated — 1 open');
    expect(tile.sublines).toEqual(['Rated — 1 open']);
  });

  test('no rows → no open seats', () => {
    const counts = countOpenSeatsByClockAndLane('rapid', []);
    const tile = formatModeRoomOpenClockTile('10 min', counts['10m']!);
    expect(tile.lit).toBe(false);
    expect(tile.compactDetail).toBe('10 min · no open seats');
  });

  test('bot-hosted Cardi row → excluded from public count and rows', () => {
    const cardiRow = {
      id: CARDI_GHOST_ROW_ID,
      white_player_id: CANONICAL_CARDI_BOT_USER_ID,
      black_player_id: null,
      tempo: 'live',
      live_time_control: '5+5',
      rated: false,
      status: 'active',
    };
    expect(isBotHostedPublicOpenSeat(cardiRow)).toBe(true);
    const { openCandidates, seatedForBusy } = partitionLobbyRowsForPublicOpen([cardiRow]);
    const visible = filterPublicVisibleOpenSeats(openCandidates, seatedForBusy, 'blitz');
    expect(visible).toHaveLength(0);
    const counts = countOpenSeatsByClockAndLane('blitz', visible);
    expect(counts['5+5']!.total).toBe(0);
  });

  test('host-busy row → excluded consistently', () => {
    const open = rapid10mRated('open', 'host-user');
    const seated = {
      id: 'seated',
      white_player_id: 'host-user',
      black_player_id: 'other',
      tempo: 'live',
      live_time_control: '10m',
      rated: true,
      status: 'active',
    };
    expect(openSeatRowHostSeatedConflictsInSameSlot(open, seated)).toBe(true);
    const { openCandidates, seatedForBusy } = partitionLobbyRowsForPublicOpen([open, seated]);
    const visible = filterPublicVisibleOpenSeats(openCandidates, seatedForBusy, 'rapid');
    expect(visible).toHaveLength(0);
  });

  test('compact count equals visible valid rows for selected slice', () => {
    const rows = [
      rapid10mRated('r1', 'u1'),
      rapid10mUnrated('u1', 'u2'),
      rapid10mRated('r2', 'u3'),
      { ...rapid10mRated('r3', 'u4'), live_time_control: '15m' },
    ];
    const { openCandidates, seatedForBusy } = partitionLobbyRowsForPublicOpen(rows);
    const visible = filterPublicVisibleOpenSeats(openCandidates, seatedForBusy, 'rapid');
    const counts = countOpenSeatsByClockAndLane('rapid', visible);
    expect(countVisiblePublicOpenSeatsForSlice(visible, 'rapid', '10m', true)).toBe(counts['10m']!.rated);
    expect(countVisiblePublicOpenSeatsForSlice(visible, 'rapid', '10m', false)).toBe(counts['10m']!.unrated);
    expect(counts['10m']!.total).toBe(
      countVisiblePublicOpenSeatsForSlice(visible, 'rapid', '10m', true) +
        countVisiblePublicOpenSeatsForSlice(visible, 'rapid', '10m', false),
    );
  });

  test('waiting-seat cards use PLAT mode · lane label', () => {
    expect(
      openSeatExactControlDisplayLabel({
        tempo: 'live',
        live_time_control: '10m',
        rated: true,
      }),
    ).toBe('Rapid 10M · Rated');
    expect(
      openSeatExactControlDisplayLabel({
        tempo: 'live',
        live_time_control: '10m',
        rated: false,
      }),
    ).toBe('Rapid 10M · Unrated');
    expect(
      openSeatExactControlDisplayLabel({
        tempo: 'live',
        live_time_control: '5+5',
        rated: true,
      }),
    ).toBe('Blitz 5+5 · Rated');
  });

  test('hub obligation row can render lane label when rated is present', () => {
    const label = openSeatExactControlDisplayLabel({
      tempo: 'live',
      live_time_control: '10m',
      rated: true,
    });
    expect(label).toContain('Rated');
    expect(label).toMatch(/^Rapid 10M/);
  });
});
