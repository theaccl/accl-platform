import { expect, test } from '@playwright/test';

import { insertGameMoveLog } from '@/lib/replay/gameMoveLogInsert';

const baseRow = {
  game_id: '00000000-0000-0000-0000-000000000099',
  player_id: '00000000-0000-0000-0000-000000000001',
  san: 'e4',
  from_sq: 'e2',
  to_sq: 'e4',
  fen_before: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  fen_after: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
  move_duration_ms: 100,
};

function mockSupabase(insertResult: { error: { message: string } | null }) {
  return {
    from: () => ({
      insert: async () => insertResult,
    }),
  } as never;
}

test.describe('insertGameMoveLog', () => {
  test('returns ok on successful insert', async () => {
    const r = await insertGameMoveLog(mockSupabase({ error: null }), baseRow, 'human');
    expect(r.ok).toBe(true);
  });

  test('human context maps to human_move_log_failed', async () => {
    const r = await insertGameMoveLog(
      mockSupabase({ error: { message: 'db down' } }),
      baseRow,
      'human',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('human_move_log_failed');
      expect(r.dbError).toBe('db down');
    }
  });

  test('bot context maps to bot_move_log_failed', async () => {
    const r = await insertGameMoveLog(
      mockSupabase({ error: { message: 'constraint' } }),
      baseRow,
      'bot',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('bot_move_log_failed');
  });

  test('legacy_ops context maps to move_log_insert_failed', async () => {
    const r = await insertGameMoveLog(
      mockSupabase({ error: { message: 'fail' } }),
      baseRow,
      'legacy_ops',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('move_log_insert_failed');
  });
});
