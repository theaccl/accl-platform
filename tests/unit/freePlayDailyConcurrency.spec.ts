import { expect, test } from '@playwright/test';

import { CANONICAL_CARDI_BOT_USER_ID } from '@/lib/bot/botIdentity';
import { formatCreateSeatedGameGuardError } from '@/lib/formatCreateSeatedGameGuardError';
import {
  RATED_DAILY_CAP_MESSAGE,
  RATED_DAILY_OBLIGATION_CAP,
  UNRATED_DAILY_QUEUE_CAP_MESSAGE,
  UNRATED_DAILY_WAITING_QUEUE_CAP,
  countRatedDailyObligations,
  countUnratedDailyWaitingSeats,
  countsAsRatedDailyObligation,
  countsAsUnratedDailyWaitingSeat,
  isDailyConcurrencyCountableRow,
} from '@/lib/freePlayDailyConcurrency';
import {
  filterPublicVisibleOpenSeats,
  isPublicUnmatchedOpenSeatRow,
  partitionLobbyRowsForPublicOpen,
} from '@/lib/freeLobbyOpenSeatFilters';

const HOST = 'user-host';

function dailyRow(
  id: string,
  opts: {
    rated: boolean;
    black?: string | null;
    ltc?: string;
    status?: string;
    end_reason?: string | null;
    white?: string;
  },
) {
  return {
    id,
    white_player_id: opts.white ?? HOST,
    black_player_id: opts.black === undefined ? null : opts.black,
    tempo: 'daily',
    live_time_control: opts.ltc ?? '1d',
    rated: opts.rated,
    status: opts.status ?? 'active',
    end_reason: opts.end_reason ?? null,
    play_context: 'free',
    tournament_id: null,
  };
}

function buildRatedObligations(n: number) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const seated = i % 2 === 0;
    rows.push(
      dailyRow(`r-${i}`, {
        rated: true,
        ltc: ['1d', '2d', '3d', '7d'][i % 4],
        black: seated ? `opp-${i}` : null,
      }),
    );
  }
  return rows;
}

test.describe('freePlayDailyConcurrency', () => {
  test('rated: 4 obligations allow; 5 block message constants', () => {
    const rows = buildRatedObligations(4);
    expect(countRatedDailyObligations(rows, HOST)).toBe(4);
    expect(countRatedDailyObligations(buildRatedObligations(5), HOST)).toBe(5);
    expect(RATED_DAILY_OBLIGATION_CAP).toBe(5);
    expect(RATED_DAILY_CAP_MESSAGE).toContain('5 rated Daily games');
  });

  test('rated: mixed queued + ongoing count together across controls', () => {
    const rows = [
      dailyRow('q', { rated: true, ltc: '1d', black: null }),
      dailyRow('s', { rated: true, ltc: '7d', black: 'guest' }),
      dailyRow('q2', { rated: true, ltc: '2d', black: null }),
      dailyRow('s2', { rated: true, ltc: '3d', black: 'guest-2' }),
    ];
    expect(countRatedDailyObligations(rows, HOST)).toBe(4);
    expect(countsAsRatedDailyObligation(rows[1], 'guest')).toBe(true);
  });

  test('rated: finished rows do not count; active/waiting with neutral end_reason still count', () => {
    const rows = [
      dailyRow('done', { rated: true, status: 'finished' }),
      dailyRow('done2', { rated: true, status: 'finished', end_reason: 'superseded' }),
      dailyRow('malformed', { rated: true, end_reason: 'superseded', status: 'active' }),
      dailyRow('live', { rated: true }),
    ];
    expect(isDailyConcurrencyCountableRow(rows[0])).toBe(false);
    expect(isDailyConcurrencyCountableRow(rows[1])).toBe(false);
    expect(countsAsRatedDailyObligation(rows[2], HOST)).toBe(true);
    expect(countRatedDailyObligations(rows, HOST)).toBe(2);
  });

  test('unrated: waiting seats cap at 5; seated ongoing does not count', () => {
    const waiting = Array.from({ length: 5 }, (_, i) =>
      dailyRow(`w-${i}`, { rated: false, ltc: ['1d', '2d', '3d', '7d', '1d'][i] }),
    );
    const seated = [
      dailyRow('seat-1', { rated: false, black: 'p2' }),
      dailyRow('seat-2', { rated: false, black: 'p3', ltc: '2d' }),
    ];
    expect(countUnratedDailyWaitingSeats(waiting, HOST)).toBe(5);
    expect(countUnratedDailyWaitingSeats([...waiting, ...seated], HOST)).toBe(5);
    expect(UNRATED_DAILY_WAITING_QUEUE_CAP).toBe(5);
    expect(UNRATED_DAILY_QUEUE_CAP_MESSAGE).toContain('5 unrated Daily games waiting');
  });

  test('unrated: 4 waiting allows another queue post (count helper)', () => {
    const rows = Array.from({ length: 4 }, (_, i) => dailyRow(`w-${i}`, { rated: false }));
    expect(countUnratedDailyWaitingSeats(rows, HOST)).toBe(4);
    expect(countUnratedDailyWaitingSeats(rows, HOST) >= UNRATED_DAILY_WAITING_QUEUE_CAP).toBe(false);
  });

  test('unrated: host-only waiting; joiner row does not count toward host waiting cap', () => {
    const hostWaiting = dailyRow('host-w', { rated: false });
    const otherHost = dailyRow('other', { rated: false, white: 'other-user' });
    expect(countsAsUnratedDailyWaitingSeat(hostWaiting, HOST)).toBe(true);
    expect(countsAsUnratedDailyWaitingSeat(otherHost, HOST)).toBe(false);
  });

  test('discoverability: daily public open seats still partition after concurrency helpers exist', () => {
    const rated = {
      id: 'pub-rated',
      white_player_id: 'host-a',
      black_player_id: null,
      tempo: 'daily',
      live_time_control: '1d',
      rated: true,
      status: 'active',
      play_context: 'free',
      tournament_id: null,
    };
    const unrated = { ...rated, id: 'pub-unrated', rated: false };
    expect(isPublicUnmatchedOpenSeatRow(rated)).toBe(true);
    const { openCandidates, seatedForBusy } = partitionLobbyRowsForPublicOpen([rated, unrated]);
    const visible = filterPublicVisibleOpenSeats(openCandidates, seatedForBusy, 'daily');
    expect(visible).toHaveLength(2);
  });

  test('SQL exception tokens map to locked UX copy', () => {
    expect(formatCreateSeatedGameGuardError('free_play_daily_rated_cap')).toBe(RATED_DAILY_CAP_MESSAGE);
    expect(formatCreateSeatedGameGuardError('free_play_daily_unrated_waiting_cap')).toBe(
      UNRATED_DAILY_QUEUE_CAP_MESSAGE,
    );
  });

  test('bot-hosted daily waiting seat is not a user concurrency row (public filter)', () => {
    const ghost = {
      id: 'ghost',
      white_player_id: CANONICAL_CARDI_BOT_USER_ID,
      black_player_id: null,
      tempo: 'daily',
      live_time_control: '1d',
      rated: false,
      status: 'active',
      play_context: 'free',
      tournament_id: null,
    };
    expect(countsAsUnratedDailyWaitingSeat(ghost, CANONICAL_CARDI_BOT_USER_ID)).toBe(true);
    const { openCandidates, seatedForBusy } = partitionLobbyRowsForPublicOpen([ghost]);
    expect(filterPublicVisibleOpenSeats(openCandidates, seatedForBusy, 'daily')).toHaveLength(0);
  });
});
