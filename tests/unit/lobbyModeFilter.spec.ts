import { expect, test } from '@playwright/test';

import {
  countYourMoveByPlatMode,
  filterRowsByLobbyMode,
  isPlatMode,
  platModeForLobbyRow,
} from '@/lib/lobbyModeFilter';

test.describe('lobby mode filter (unit)', () => {
  test('maps live time controls to plat buckets', () => {
    expect(platModeForLobbyRow({ tempo: 'live', live_time_control: '5m' })).toBe('blitz');
    expect(platModeForLobbyRow({ tempo: 'daily', live_time_control: '1d' })).toBe('daily');
  });

  test('filters rows by selected mode', () => {
    const rows = [
      { id: 'a', tempo: 'live', live_time_control: '5m' },
      { id: 'b', tempo: 'live', live_time_control: '1m' },
    ];
    expect(filterRowsByLobbyMode(rows, 'blitz')).toHaveLength(1);
    expect(filterRowsByLobbyMode(rows, null)).toHaveLength(2);
  });

  test('isPlatMode validates mode query tokens', () => {
    expect(isPlatMode('blitz')).toBe(true);
    expect(isPlatMode('swiss')).toBe(false);
  });

  test('countYourMoveByPlatMode buckets by turn', () => {
    const uid = 'u1';
    const counts = countYourMoveByPlatMode(
      [
        {
          id: '1',
          status: 'active',
          tempo: 'live',
          live_time_control: '5m',
          turn: 'white',
          white_player_id: uid,
          black_player_id: 'u2',
        },
      ],
      uid,
    );
    expect(counts.blitz).toBe(1);
    expect(counts.bullet).toBe(0);
  });
});
