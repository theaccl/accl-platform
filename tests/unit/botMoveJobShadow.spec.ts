import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isBotMoveQueueEnabled, isBotMoveQueueShadowEnabled } from '@/lib/bot/botMoveQueueFeature';
import { buildMoveIdempotencyKey } from '@/lib/replay/moveIdempotencyKey';
import { recordShadowBotMoveJob } from '@/lib/server/botMoveJobShadow';

const GAME = '3949264a-5529-4d21-8581-18b9d1e6fe05';
const BOT = '9bc30963-68d9-41b7-a442-b38c450301d2';
const FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';

test.describe('bot_move_jobs shadow enqueue (Phase 1I-b)', () => {
  test('shadow migration defines record_bot_move_job_shadow_system', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '20260531190000_record_bot_move_job_shadow.sql'),
      'utf8',
    );
    expect(sql).toContain('record_bot_move_job_shadow_system');
    expect(sql).toContain("'completed'");
    expect(sql).toContain('on conflict (game_id, idempotency_key)');
    expect(sql).toContain('grant execute');
  });

  test('BOT_MOVE_QUEUE_ENABLED off; shadow off by default', () => {
    const prevE = process.env.BOT_MOVE_QUEUE_ENABLED;
    const prevS = process.env.BOT_MOVE_QUEUE_SHADOW;
    delete process.env.BOT_MOVE_QUEUE_ENABLED;
    delete process.env.BOT_MOVE_QUEUE_SHADOW;
    expect(isBotMoveQueueEnabled()).toBe(false);
    expect(isBotMoveQueueShadowEnabled()).toBe(false);
    if (prevE === undefined) delete process.env.BOT_MOVE_QUEUE_ENABLED;
    else process.env.BOT_MOVE_QUEUE_ENABLED = prevE;
    if (prevS === undefined) delete process.env.BOT_MOVE_QUEUE_SHADOW;
    else process.env.BOT_MOVE_QUEUE_SHADOW = prevS;
  });

  test('shadow flag on enables isBotMoveQueueShadowEnabled only', () => {
    const prevS = process.env.BOT_MOVE_QUEUE_SHADOW;
    process.env.BOT_MOVE_QUEUE_SHADOW = '1';
    expect(isBotMoveQueueShadowEnabled()).toBe(true);
    expect(isBotMoveQueueEnabled()).toBe(false);
    if (prevS === undefined) delete process.env.BOT_MOVE_QUEUE_SHADOW;
    else process.env.BOT_MOVE_QUEUE_SHADOW = prevS;
  });

  test('idempotency key matches bot move-log slot format', () => {
    const key = buildMoveIdempotencyKey({
      gameId: GAME,
      fenBefore: FEN,
      playerId: BOT,
      fromSq: 'e7',
      toSq: 'e5',
      promotion: null,
    });
    expect(key.startsWith('mv:')).toBe(true);
    expect(key).toContain(GAME);
    expect(key).toContain(':e7:');
    expect(key).toContain(':e5:');
  });

  test('recordShadowBotMoveJob skipped when shadow flag off', async () => {
    const prev = process.env.BOT_MOVE_QUEUE_SHADOW;
    delete process.env.BOT_MOVE_QUEUE_SHADOW;
    const result = await recordShadowBotMoveJob(
      { rpc: async () => ({ data: null, error: { message: 'should not run' } }) } as never,
      {
        gameId: GAME,
        postHumanFen: FEN,
        botPlayerId: BOT,
        idempotencyKey: 'mv:test',
        selectedUci: 'e7e5',
        thinkMs: 10,
      },
    );
    expect(result).toEqual({ ok: true, skipped: true });
    if (prev === undefined) delete process.env.BOT_MOVE_QUEUE_SHADOW;
    else process.env.BOT_MOVE_QUEUE_SHADOW = prev;
  });

  test('recordShadowBotMoveJob RPC failure does not throw', async () => {
    const prev = process.env.BOT_MOVE_QUEUE_SHADOW;
    process.env.BOT_MOVE_QUEUE_SHADOW = '1';
    const result = await recordShadowBotMoveJob(
      {
        rpc: async () => ({ data: null, error: { message: 'db down' } }),
      } as never,
      {
        gameId: GAME,
        postHumanFen: FEN,
        botPlayerId: BOT,
        idempotencyKey: 'mv:test:shadow-fail',
        selectedUci: 'e7e5',
        thinkMs: 10,
      },
    );
    expect(result.ok).toBe(false);
    if ('error' in result) expect(result.error).toContain('db down');
    if (prev === undefined) delete process.env.BOT_MOVE_QUEUE_SHADOW;
    else process.env.BOT_MOVE_QUEUE_SHADOW = prev;
  });

  test('sync commit path remains authoritative', () => {
    const commitSrc = readFileSync(
      join(process.cwd(), 'lib', 'server', 'submitMoveBotGameCommit.ts'),
      'utf8',
    );
    expect(commitSrc).toContain('apply_bot_game_turn_system');
    expect(commitSrc).toContain('finalizeBotGameSuccess');
    expect(commitSrc).toContain('recordShadowBotMoveJob');
    expect(commitSrc).not.toContain('claim_next_bot_move_job');
    expect(commitSrc).not.toMatch(/if\s*\(\s*isBotMoveQueueEnabled/);
  });

  test('no processor route and no submit-move cutover', () => {
    const routeSrc = readFileSync(
      join(process.cwd(), 'app', 'api', 'game', 'submit-move', 'route.ts'),
      'utf8',
    );
    expect(routeSrc).not.toContain('/api/internal/bot-move-queue');
    expect(routeSrc).not.toContain('isBotMoveQueueEnabled');
    expect(routeSrc).toContain('commitBotGameTurn');
  });
});
