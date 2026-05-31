import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  allKnownBotHostUserIds,
  BOT_USER_IDS,
  CANONICAL_CARDI_BOT_USER_ID,
  configuredBotUserIds,
  isKnownBotHostUserId,
} from '@/lib/bot/botIdentity';
import {
  countOpenSeatsByClockAndLane,
  emptyClockLaneCountsForMode,
} from '@/lib/lobbyModeClockActivity';
import {
  filterPublicVisibleOpenSeats,
  isBotHostedPublicOpenSeat,
  partitionLobbyRowsForPublicOpen,
} from '@/lib/freeLobbyOpenSeatFilters';

const CARDI_GHOST_ROW_ID = '63e67ea9-b0d9-42e0-9fa6-f76344c6475b';
const PRODUCTION_CARDI = CANONICAL_CARDI_BOT_USER_ID;
const DEV_CARDI = BOT_USER_IDS['Cardi Bot'];

function withBotEnvUnset<T>(fn: () => T): T {
  const keys = [
    'BOT_USER_ID_CARDI',
    'NEXT_PUBLIC_BOT_USER_ID_CARDI',
    'BOT_USER_ID_AGGRO',
    'NEXT_PUBLIC_BOT_USER_ID_AGGRO',
    'BOT_USER_ID_ENDGAME',
    'NEXT_PUBLIC_BOT_USER_ID_ENDGAME',
  ] as const;
  const saved: Record<string, string | undefined> = {};
  for (const k of keys) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  try {
    return fn();
  } finally {
    for (const k of keys) {
      if (saved[k] !== undefined) process.env[k] = saved[k];
      else delete process.env[k];
    }
  }
}

test.describe('botHostIdentity — client-safe known hosts', () => {
  test('production Cardi UUID recognized with BOT_USER_ID_CARDI unset', () => {
    withBotEnvUnset(() => {
      expect(isKnownBotHostUserId(PRODUCTION_CARDI)).toBe(true);
      expect(allKnownBotHostUserIds().has(PRODUCTION_CARDI)).toBe(true);
    });
  });

  test('dev/default Cardi UUID remains recognized', () => {
    withBotEnvUnset(() => {
      expect(isKnownBotHostUserId(DEV_CARDI)).toBe(true);
    });
  });

  test('configured server UUID remains recognized when env set', () => {
    const custom = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const prev = process.env.BOT_USER_ID_CARDI;
    process.env.BOT_USER_ID_CARDI = custom;
    try {
      expect(isKnownBotHostUserId(custom)).toBe(true);
      expect(configuredBotUserIds()['Cardi Bot']).toBe(custom);
    } finally {
      if (prev !== undefined) process.env.BOT_USER_ID_CARDI = prev;
      else delete process.env.BOT_USER_ID_CARDI;
    }
  });

  test('filterPublicVisibleOpenSeats excludes production Cardi ghost (client sim)', () => {
    withBotEnvUnset(() => {
      const ghost = {
        id: CARDI_GHOST_ROW_ID,
        white_player_id: PRODUCTION_CARDI,
        black_player_id: null,
        tempo: 'live',
        live_time_control: '5+5',
        rated: false,
        status: 'active',
      };
      expect(isBotHostedPublicOpenSeat(ghost)).toBe(true);
      const { openCandidates, seatedForBusy } = partitionLobbyRowsForPublicOpen([ghost]);
      const visible = filterPublicVisibleOpenSeats(openCandidates, seatedForBusy, 'blitz');
      expect(visible).toHaveLength(0);
      const counts = countOpenSeatsByClockAndLane('blitz', visible);
      expect(counts['5+5'] ?? emptyClockLaneCountsForMode('blitz')['5+5']).toEqual({
        rated: 0,
        unrated: 0,
        total: 0,
      });
    });
  });

  test('join-open-listing route rejects known bot host (static)', () => {
    const route = readFileSync(join(process.cwd(), 'app/api/match-requests/join-open-listing/route.ts'), 'utf8');
    expect(route).toContain('isKnownBotHostUserId');
    expect(route).toContain('PUBLIC_BOT_HOSTED_OPEN_SEAT_JOIN_MESSAGE');
  });

  test('Find Match fetch excludes bot hosts (static)', () => {
    const src = readFileSync(join(process.cwd(), 'lib/freePlayFindMatch.ts'), 'utf8');
    expect(src).toContain('isBotHostedPublicOpenSeat');
  });
});
