import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { buildBotGameTurnRpcParams } from '@/lib/replay/botGameTurnRpc';

test.describe('apply_bot_game_turn_system (Phase 1G)', () => {
  test('migration defines composite bot-game RPC', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '20260531160000_apply_bot_game_turn_system.sql'),
      'utf8',
    );
    expect(sql).toContain('create or replace function public.apply_bot_game_turn_system');
    expect(sql).toContain('p_human_move_log jsonb');
    expect(sql).toContain('p_bot_move_log jsonb');
    expect(sql).toContain('for update');
    expect(sql).toContain("coalesce(g.source_type, '') is distinct from 'bot_game'");
    expect(sql).toContain('finish_game_system');
    expect(sql).toContain('idempotency_key_conflict');
  });

  test('buildBotGameTurnRpcParams omits bot ply when terminal human', () => {
    const params = buildBotGameTurnRpcParams({
      gameId: '00000000-0000-4000-8000-000000000001',
      expectedFen: 'start',
      humanPatch: {
        fen: 'after-human',
        turn: 'black',
        last_move_at: null,
        move_deadline_at: null,
        white_clock_ms: null,
        black_clock_ms: null,
        promote_waiting_to_active: false,
      },
      humanTerminal: { result: 'white_win', endReason: 'checkmate' },
      humanMoveLog: {
        game_id: '00000000-0000-4000-8000-000000000001',
        player_id: '00000000-0000-4000-8000-000000000002',
        san: 'Qh5#',
        from_sq: 'd1',
        to_sq: 'h5',
        fen_before: 'start',
        fen_after: 'after-human',
        move_duration_ms: 0,
        idempotency_key: 'cm:test',
      },
      botPatch: null,
      botTerminal: null,
      botMoveLog: null,
    });
    expect(params.p_human_result).toBe('white_win');
    expect(params.p_bot_move_log).toBeNull();
    expect(params.p_bot_next_fen).toBeNull();
  });

  test('buildBotGameTurnRpcParams includes bot finish when provided', () => {
    const params = buildBotGameTurnRpcParams({
      gameId: '00000000-0000-4000-8000-000000000001',
      expectedFen: 'pre',
      humanPatch: {
        fen: 'mid',
        turn: 'black',
        last_move_at: '2026-01-01T00:00:00.000Z',
        move_deadline_at: null,
        white_clock_ms: 600000,
        black_clock_ms: 600000,
        promote_waiting_to_active: false,
      },
      humanTerminal: null,
      humanMoveLog: {
        game_id: '00000000-0000-4000-8000-000000000001',
        player_id: '00000000-0000-4000-8000-000000000002',
        san: 'e4',
        from_sq: 'e2',
        to_sq: 'e4',
        fen_before: 'pre',
        fen_after: 'mid',
        move_duration_ms: 100,
        idempotency_key: 'mv:1',
      },
      botPatch: {
        fen: 'end',
        turn: 'white',
        last_move_at: '2026-01-01T00:00:01.000Z',
        move_deadline_at: null,
        white_clock_ms: 599000,
        black_clock_ms: 600000,
      },
      botTerminal: { result: 'black_win', endReason: 'checkmate' },
      botMoveLog: {
        game_id: '00000000-0000-4000-8000-000000000001',
        player_id: '00000000-0000-4000-8000-000000000003',
        san: 'Qh4#',
        from_sq: 'd8',
        to_sq: 'h4',
        fen_before: 'mid',
        fen_after: 'end',
        move_duration_ms: 50,
        idempotency_key: 'mv:2',
      },
    });
    expect(params.p_bot_result).toBe('black_win');
    expect(params.p_bot_end_reason).toBe('checkmate');
    expect(params.p_bot_next_fen).toBe('end');
  });
});

test.describe('submit-move bot composite path (static)', () => {
  test('bot_game uses apply_bot_game_turn_system not dual single-ply RPC', () => {
    const routeSrc = readFileSync(
      join(process.cwd(), 'app', 'api', 'game', 'submit-move', 'route.ts'),
      'utf8',
    );
    const commitSrc = readFileSync(
      join(process.cwd(), 'lib', 'server', 'submitMoveBotGameCommit.ts'),
      'utf8',
    );
    expect(routeSrc).toContain('commitBotGameTurn');
    expect(routeSrc).toContain('isBotGame');
    expect(commitSrc).toContain("'apply_bot_game_turn_system'");
    expect(commitSrc).not.toContain('apply_move_and_maybe_finish_system');

    const botBlockEnd = routeSrc.indexOf('let committedHumanRow');
    const botBlock = routeSrc.slice(routeSrc.indexOf('if (isBotGame)'), botBlockEnd);
    const nonBotBlock = routeSrc.slice(botBlockEnd);
    expect(botBlock).not.toContain('apply_move_and_maybe_finish_system');
    expect(nonBotBlock).toContain('apply_move_and_maybe_finish_system');
  });
});
