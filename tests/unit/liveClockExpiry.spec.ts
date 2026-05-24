import { expect, test } from '@playwright/test';
import {
  isLiveGameClockExpired,
  isLiveGameWatchableByClock,
  liveDailyClockTimeoutState,
} from '@/lib/liveClockExpiry';

const baseRow = {
  tempo: 'live',
  status: 'active',
  turn: 'white',
  white_player_id: 'w1',
  black_player_id: 'b1',
  live_time_control: '2+1',
  white_clock_ms: 120_000,
  black_clock_ms: 120_000,
};

test.describe('liveClockExpiry', () => {
  test('flags white when white is to move and clock is exhausted', () => {
    const lastMoveAt = new Date('2026-05-24T12:00:00.000Z').toISOString();
    const nowMs = new Date('2026-05-24T12:05:00.000Z').getTime();
    const row = { ...baseRow, last_move_at: lastMoveAt, white_clock_ms: 60_000 };

    const state = liveDailyClockTimeoutState(row, nowMs);
    expect(state.applies).toBe(true);
    expect(state.flaggedLoser).toBe('white');
    expect(isLiveGameClockExpired(row, nowMs)).toBe(true);
    expect(isLiveGameWatchableByClock(row, nowMs)).toBe(false);
  });

  test('does not flag when side to move still has time', () => {
    const lastMoveAt = new Date('2026-05-24T12:00:00.000Z').toISOString();
    const nowMs = new Date('2026-05-24T12:01:00.000Z').getTime();
    const row = { ...baseRow, last_move_at: lastMoveAt, white_clock_ms: 120_000 };

    expect(isLiveGameClockExpired(row, nowMs)).toBe(false);
    expect(isLiveGameWatchableByClock(row, nowMs)).toBe(true);
  });

  test('does not apply before first move (no last_move_at)', () => {
    const row = { ...baseRow, last_move_at: null, status: 'waiting' as const };
    expect(isLiveGameClockExpired(row)).toBe(false);
  });

  test('does not apply to finished or non-live tempo', () => {
    const lastMoveAt = new Date().toISOString();
    expect(
      isLiveGameClockExpired({ ...baseRow, status: 'finished', last_move_at: lastMoveAt }),
    ).toBe(false);
    expect(
      isLiveGameClockExpired({ ...baseRow, tempo: 'correspondence', last_move_at: lastMoveAt }),
    ).toBe(false);
  });

  test('uses clockBudgetMsForGame when stored clocks are missing', () => {
    const lastMoveAt = new Date('2026-05-24T12:00:00.000Z').toISOString();
    const nowMs = new Date('2026-05-24T12:03:00.000Z').getTime();
    const row = {
      ...baseRow,
      live_time_control: '2+1',
      last_move_at: lastMoveAt,
      white_clock_ms: null,
      black_clock_ms: null,
    };

    expect(isLiveGameClockExpired(row, nowMs)).toBe(true);
  });
});
