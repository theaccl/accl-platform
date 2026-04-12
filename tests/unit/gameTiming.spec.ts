import { test, expect } from '@playwright/test';

import {
  isCorrespondenceDeadlineActive,
  isLiveDailyClockTicking,
  preStartGameTimingFields,
} from '../../lib/gameTiming';

test.describe('gameTiming predicates', () => {
  const seated = {
    white_player_id: 'w1',
    black_player_id: 'b1',
    status: 'active' as const,
  };

  test('preStartGameTimingFields keeps clocks neutral', () => {
    expect(preStartGameTimingFields()).toEqual({ last_move_at: null, move_deadline_at: null });
  });

  test('isLiveDailyClockTicking is false until last_move_at is set', () => {
    expect(
      isLiveDailyClockTicking({
        ...seated,
        tempo: 'live',
        last_move_at: null,
      })
    ).toBe(false);
    expect(
      isLiveDailyClockTicking({
        ...seated,
        tempo: 'daily',
        last_move_at: null,
      })
    ).toBe(false);
    expect(
      isLiveDailyClockTicking({
        ...seated,
        tempo: 'live',
        last_move_at: '2026-04-03T12:00:00.000Z',
      })
    ).toBe(true);
  });

  test('isLiveDailyClockTicking is false for solo seat or finished', () => {
    expect(
      isLiveDailyClockTicking({
        white_player_id: 'w1',
        black_player_id: null,
        tempo: 'live',
        last_move_at: '2026-04-03T12:00:00.000Z',
        status: 'active',
      })
    ).toBe(false);
    expect(
      isLiveDailyClockTicking({
        ...seated,
        tempo: 'live',
        last_move_at: '2026-04-03T12:00:00.000Z',
        status: 'finished',
      })
    ).toBe(false);
  });

  test('isCorrespondenceDeadlineActive mirrors move_deadline_at gating', () => {
    expect(
      isCorrespondenceDeadlineActive({
        ...seated,
        tempo: 'correspondence',
        move_deadline_at: null,
      })
    ).toBe(false);
    expect(
      isCorrespondenceDeadlineActive({
        ...seated,
        tempo: 'correspondence',
        move_deadline_at: '2026-04-04T12:00:00.000Z',
      })
    ).toBe(true);
  });
});
