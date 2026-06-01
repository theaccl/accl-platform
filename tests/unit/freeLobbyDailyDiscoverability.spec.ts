import { expect, test } from '@playwright/test';

import { CANONICAL_CARDI_BOT_USER_ID } from '@/lib/bot/botIdentity';
import { rowIndicatesDailyFreePlayPacing, rowIndicatesLiveFreePlayPacing } from '@/lib/freePlayLiveSession';
import {
  filterPublicVisibleOpenSeats,
  isPublicUnmatchedDailyOpenSeatRow,
  isPublicUnmatchedLiveOpenSeatRow,
  isPublicUnmatchedOpenSeatRow,
  openSeatExactControlDisplayLabel,
  partitionLobbyRowsForPublicOpen,
} from '@/lib/freeLobbyOpenSeatFilters';
import { openSeatRowHostSeatedConflictsInSameSlot } from '@/lib/freePlayQueueSlotConflict';
import {
  countOpenSeatsByClockAndLane,
  formatModeRoomOpenClockTile,
} from '@/lib/lobbyModeClockActivity';
import { platBucketForOpenSeat } from '@/lib/platOpenSeatBucket';

function daily1dRated(id: string, host: string) {
  return {
    id,
    white_player_id: host,
    black_player_id: null as string | null,
    tempo: 'daily',
    live_time_control: '1d',
    rated: true,
    status: 'active',
    play_context: 'free',
    tournament_id: null,
  };
}

function daily1dUnrated(id: string, host: string) {
  return { ...daily1dRated(id, host), rated: false };
}

function rapid10mRated(id: string, host: string) {
  return {
    id,
    white_player_id: host,
    black_player_id: null as string | null,
    tempo: 'live',
    live_time_control: '10m',
    rated: true,
    status: 'active',
    play_context: 'free',
    tournament_id: null,
  };
}

test.describe('freeLobbyDailyDiscoverability', () => {
  test('daily unmatched rows are public open candidates; live predicate stays live-only', () => {
    const rated = daily1dRated('d-rated', 'host-1');
    const unrated = daily1dUnrated('d-unrated', 'host-1');
    expect(isPublicUnmatchedDailyOpenSeatRow(rated)).toBe(true);
    expect(isPublicUnmatchedDailyOpenSeatRow(unrated)).toBe(true);
    expect(isPublicUnmatchedOpenSeatRow(rated)).toBe(true);
    expect(isPublicUnmatchedLiveOpenSeatRow(rated)).toBe(false);
    expect(rowIndicatesDailyFreePlayPacing(rated)).toBe(true);
    expect(rowIndicatesLiveFreePlayPacing(rated)).toBe(false);

    const live = rapid10mRated('live', 'host-2');
    expect(isPublicUnmatchedLiveOpenSeatRow(live)).toBe(true);
    expect(isPublicUnmatchedDailyOpenSeatRow(live)).toBe(false);
  });

  test('Daily 1D Rated + Unrated coexist in hub-style partition and lane tiles', () => {
    const { openCandidates, seatedForBusy } = partitionLobbyRowsForPublicOpen([
      daily1dRated('a', 'user-a'),
      daily1dUnrated('b', 'user-a'),
      rapid10mRated('live', 'user-c'),
    ]);
    expect(openCandidates).toHaveLength(3);

    const dailyVisible = filterPublicVisibleOpenSeats(openCandidates, seatedForBusy, 'daily');
    expect(dailyVisible).toHaveLength(2);
    const dailyCounts = countOpenSeatsByClockAndLane('daily', dailyVisible);
    const tile = formatModeRoomOpenClockTile('1 day', dailyCounts['1d']!);
    expect(tile.lit).toBe(true);
    expect(tile.sublines).toEqual(['Rated — 1 open', 'Unrated — 1 open']);

    const rapidVisible = filterPublicVisibleOpenSeats(openCandidates, seatedForBusy, 'rapid');
    expect(rapidVisible).toHaveLength(1);
  });

  test('hub daily count aggregates both lanes; list slice is lane-scoped', () => {
    const { openCandidates, seatedForBusy } = partitionLobbyRowsForPublicOpen([
      daily1dRated('r', 'u1'),
      daily1dUnrated('u', 'u2'),
    ]);
    const visible = filterPublicVisibleOpenSeats(openCandidates, seatedForBusy);
    const dailyRows = visible.filter(
      (r) => platBucketForOpenSeat(r.tempo, r.live_time_control) === 'daily',
    );
    expect(dailyRows).toHaveLength(2);

    const ratedOnly = filterPublicVisibleOpenSeats(openCandidates, seatedForBusy, 'daily').filter(
      (r) => r.rated === true,
    );
    const unratedOnly = filterPublicVisibleOpenSeats(openCandidates, seatedForBusy, 'daily').filter(
      (r) => r.rated !== true,
    );
    expect(ratedOnly).toHaveLength(1);
    expect(unratedOnly).toHaveLength(1);
  });

  test('daily row identity uses Daily control + lane', () => {
    expect(
      openSeatExactControlDisplayLabel({
        tempo: 'daily',
        live_time_control: '1d',
        rated: true,
      }),
    ).toBe('Daily 1D · Rated');
    expect(
      openSeatExactControlDisplayLabel({
        tempo: 'daily',
        live_time_control: '1d',
        rated: false,
      }),
    ).toBe('Daily 1D · Unrated');
  });

  test('host seated in live same slot does not hide public daily open seat', () => {
    const dailyOpen = daily1dRated('open', 'host-user');
    const seatedLive = {
      id: 'seated',
      white_player_id: 'host-user',
      black_player_id: 'other',
      tempo: 'live',
      live_time_control: '10m',
      rated: true,
      status: 'active',
    };
    expect(openSeatRowHostSeatedConflictsInSameSlot(dailyOpen, seatedLive)).toBe(false);
    const { openCandidates, seatedForBusy } = partitionLobbyRowsForPublicOpen([
      dailyOpen,
      seatedLive,
    ]);
    const visible = filterPublicVisibleOpenSeats(openCandidates, seatedForBusy, 'daily');
    expect(visible).toHaveLength(1);
  });

  test('bot-hosted daily ghost row stays excluded', () => {
    const ghost = {
      ...daily1dUnrated('ghost', CANONICAL_CARDI_BOT_USER_ID),
      white_player_id: CANONICAL_CARDI_BOT_USER_ID,
    };
    const { openCandidates, seatedForBusy } = partitionLobbyRowsForPublicOpen([ghost]);
    const visible = filterPublicVisibleOpenSeats(openCandidates, seatedForBusy, 'daily');
    expect(visible).toHaveLength(0);
  });

  test('non-active daily row is not a public open candidate', () => {
    const expired = { ...daily1dRated('x', 'u'), status: 'finished' };
    expect(isPublicUnmatchedOpenSeatRow(expired)).toBe(false);
    const { openCandidates } = partitionLobbyRowsForPublicOpen([expired]);
    expect(openCandidates).toHaveLength(0);
  });
});
