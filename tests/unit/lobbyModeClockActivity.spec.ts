import { expect, test } from '@playwright/test';

import {
  countOpenSeatsByClock,
  countOpenSeatsByClockAndLane,
  countWatchRowsByClock,
  formatModeRoomOpenClockTile,
  formatModeRoomWatchClockTile,
  platClockIdFromWatchKey,
} from '../../lib/lobbyModeClockActivity';

test.describe('lobbyModeClockActivity', () => {
  test('countOpenSeatsByClock buckets rapid seats by PLAT clock id', () => {
    const counts = countOpenSeatsByClock('rapid', [
      { tempo: 'live', live_time_control: '10m', rated: true },
      { tempo: 'live', live_time_control: '10m', rated: false },
      { tempo: 'live', live_time_control: '15m', rated: true },
    ]);
    expect(counts['10m']).toBe(2);
    expect(counts['15m']).toBe(1);
    expect(counts['30m']).toBe(0);
  });

  test('countOpenSeatsByClockAndLane splits rated and unrated', () => {
    const lanes = countOpenSeatsByClockAndLane('rapid', [
      { tempo: 'live', live_time_control: '10m', rated: true },
      { tempo: 'live', live_time_control: '10m', rated: false },
    ]);
    expect(lanes['10m']).toEqual({ rated: 1, unrated: 1, total: 2 });
  });

  test('countWatchRowsByClock maps canonical watch keys to PLAT clocks', () => {
    const key = platClockIdFromWatchKey('rapid', '15m');
    expect(key).toBe('15m');
    const counts = countWatchRowsByClock('rapid', [
      { liveTimeControlKey: '15m' },
      { liveTimeControlKey: '15m' },
      { liveTimeControlKey: '30m' },
    ]);
    expect(counts['15m']).toBe(2);
    expect(counts['30m']).toBe(1);
  });

  test('tile labels include clock and lane count', () => {
    expect(formatModeRoomOpenClockTile('20 min', { rated: 2, unrated: 0, total: 2 }).compactDetail).toBe(
      '20 min · Rated — 2 open',
    );
    expect(formatModeRoomWatchClockTile('15 min', 30)).toBe('15 min · 30 live');
  });
});
