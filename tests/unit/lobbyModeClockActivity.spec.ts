import { expect, test } from '@playwright/test';

import {
  countOpenSeatsByClock,
  countWatchRowsByClock,
  formatModeRoomOpenClockTile,
  formatModeRoomWatchClockTile,
  platClockIdFromWatchKey,
} from '../../lib/lobbyModeClockActivity';

test.describe('lobbyModeClockActivity', () => {
  test('countOpenSeatsByClock buckets rapid seats by PLAT clock id', () => {
    const counts = countOpenSeatsByClock('rapid', [
      { tempo: 'live', live_time_control: '10m' },
      { tempo: 'live', live_time_control: '10m' },
      { tempo: 'live', live_time_control: '20m' },
    ]);
    expect(counts['10m']).toBe(2);
    expect(counts['20m']).toBe(1);
    expect(counts['15m']).toBe(0);
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

  test('tile labels include clock and count', () => {
    expect(formatModeRoomOpenClockTile('20 min', 2)).toBe('20 min · 2 open');
    expect(formatModeRoomWatchClockTile('15 min', 30)).toBe('15 min · 30 live');
  });
});
