import { expect, test } from '@playwright/test';

import { buildOptimisticMoveClockRow } from '@/lib/optimisticMoveClock';

const FIRST_MOVE_AT = new Date('2026-09-16T18:00:00.000Z');

test.describe('optimistic move clock', () => {
  test('starts Black immediately after White makes the first live move', () => {
    const before = {
      id: 'game-1',
      fen: 'start-fen',
      turn: 'white',
      status: 'waiting',
      tempo: 'live',
      live_time_control: '3m',
      white_player_id: 'white-1',
      black_player_id: 'black-1',
      last_move_at: null,
      move_deadline_at: null,
      white_clock_ms: 180_000,
      black_clock_ms: 180_000,
    };

    const pending = buildOptimisticMoveClockRow(before, {
      nextFen: 'fen-after-white',
      nextTurn: 'black',
      movedAt: FIRST_MOVE_AT,
    });

    expect(pending.id).toBe(before.id);
    expect(pending.fen).toBe('fen-after-white');
    expect(pending.turn).toBe('black');
    expect(pending.status).toBe('active');
    expect(pending.last_move_at).toBe(FIRST_MOVE_AT.toISOString());
    expect(pending.white_clock_ms).toBe(180_000);
    expect(pending.black_clock_ms).toBe(180_000);
  });

  test('uses the move timestamp when deducting an already-running clock', () => {
    const pending = buildOptimisticMoveClockRow(
      {
        fen: 'fen-before',
        turn: 'white',
        status: 'active',
        tempo: 'live',
        live_time_control: '3m',
        last_move_at: '2026-09-16T17:59:58.500Z',
        move_deadline_at: null,
        white_clock_ms: 170_000,
        black_clock_ms: 175_000,
      },
      {
        nextFen: 'fen-after-white',
        nextTurn: 'black',
        movedAt: FIRST_MOVE_AT,
      },
    );

    expect(pending.white_clock_ms).toBe(168_500);
    expect(pending.black_clock_ms).toBe(175_000);
  });

  test('applies Fischer increment once when handing the clock to the bot', () => {
    const pending = buildOptimisticMoveClockRow(
      {
        fen: 'fen-before',
        turn: 'white',
        status: 'active',
        tempo: 'live',
        live_time_control: '3+2',
        last_move_at: '2026-09-16T17:59:58.500Z',
        move_deadline_at: null,
        white_clock_ms: 170_000,
        black_clock_ms: 175_000,
      },
      {
        nextFen: 'fen-after-white',
        nextTurn: 'black',
        movedAt: FIRST_MOVE_AT,
      },
    );

    expect(pending.white_clock_ms).toBe(170_500);
    expect(pending.black_clock_ms).toBe(175_000);
  });

});
