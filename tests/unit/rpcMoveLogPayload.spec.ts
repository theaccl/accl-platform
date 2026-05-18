import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildRpcMoveLogPayload,
  validateRpcMoveLogPayload,
} from '@/lib/replay/rpcMoveLogPayload';

const GAME_ID = '00000000-0000-0000-0000-000000000099';
const PLAYER_ID = '00000000-0000-0000-0000-000000000001';

const validRow = {
  game_id: GAME_ID,
  player_id: PLAYER_ID,
  san: 'e4',
  from_sq: 'e2',
  to_sq: 'e4',
  fen_before: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  fen_after: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
  move_duration_ms: 120,
};

test.describe('rpc move log payload', () => {
  test('buildRpcMoveLogPayload includes required fields', () => {
    const p = buildRpcMoveLogPayload(validRow);
    expect(p.game_id).toBe(GAME_ID);
    expect(p.player_id).toBe(PLAYER_ID);
    expect(p.san).toBe('e4');
    expect(p.from_sq).toBe('e2');
    expect(p.to_sq).toBe('e4');
    expect(p.fen_after).toContain('4P3');
    expect(p.move_duration_ms).toBe(120);
  });

  test('validateRpcMoveLogPayload accepts valid row', () => {
    const r = validateRpcMoveLogPayload(GAME_ID, validRow);
    expect(r.ok).toBe(true);
  });

  test('validateRpcMoveLogPayload rejects game_id mismatch', () => {
    const r = validateRpcMoveLogPayload('00000000-0000-0000-0000-000000000001', validRow);
    expect(r.ok).toBe(false);
  });

  test('validateRpcMoveLogPayload rejects missing san', () => {
    const r = validateRpcMoveLogPayload(GAME_ID, { ...validRow, san: '' });
    expect(r.ok).toBe(false);
  });

  test('validateRpcMoveLogPayload rejects negative duration', () => {
    const r = validateRpcMoveLogPayload(GAME_ID, { ...validRow, move_duration_ms: -1 });
    expect(r.ok).toBe(false);
  });
});

test.describe('Phase 1F idempotency (static)', () => {
  test('migration adds idempotency_key and unique index', () => {
    const p = join(process.cwd(), 'supabase', 'migrations', '20260531140000_game_move_logs_idempotency.sql');
    const sql = readFileSync(p, 'utf8');
    expect(sql).toContain('idempotency_key');
    expect(sql).toContain('game_move_logs_game_idempotency_key_uidx');
    expect(sql).toContain('idempotency_key_conflict');
    expect(sql).toContain('return public.finish_game_system');
    expect(sql).toContain('if v_existing_log_found and v_skip_game_update then');
  });

  test('hotfix migration ensures explicit RETURN on all paths', () => {
    const p = join(
      process.cwd(),
      'supabase',
      'migrations',
      '20260531150000_hotfix_apply_move_idempotency_return.sql',
    );
    const sql = readFileSync(p, 'utf8');
    expect(sql).toContain('return g');
    expect(sql).toContain('return public.finish_game_system');
  });

  test('submit-move wires idempotency key and clientMoveId', () => {
    const p = join(process.cwd(), 'app', 'api', 'game', 'submit-move', 'route.ts');
    const src = readFileSync(p, 'utf8');
    expect(src).toContain('buildMoveIdempotencyKey');
    expect(src).toContain('clientMoveId');
    expect(src).toContain('idempotent_duplicate');
    expect(src).toContain('tryRecoverIdempotentHumanMove');
  });

  test('game page sends clientMoveId per submit', () => {
    const p = join(process.cwd(), 'app', 'game', '[id]', 'page.tsx');
    const src = readFileSync(p, 'utf8');
    expect(src).toContain('clientMoveId');
    expect(src).toContain('crypto.randomUUID');
  });
});

test.describe('Phase 1D transactional move log (static)', () => {
  test('migration adds p_move_log to apply_move RPC', () => {
    const p = join(
      process.cwd(),
      'supabase',
      'migrations',
      '20260530140000_apply_move_transactional_move_log.sql',
    );
    const sql = readFileSync(p, 'utf8');
    expect(sql).toContain('p_move_log jsonb default null');
    expect(sql).toContain('insert into public.game_move_logs');
    expect(sql).toContain('move_log_invalid_payload');
    expect(sql).toContain('drop function if exists public.apply_move_and_maybe_finish_system');
  });

  test('submit-move passes p_move_log and has no external log insert', () => {
    const routePath = join(process.cwd(), 'app', 'api', 'game', 'submit-move', 'route.ts');
    const commitPath = join(process.cwd(), 'lib', 'server', 'submitMoveBotGameCommit.ts');
    const routeSrc = readFileSync(routePath, 'utf8');
    const commitSrc = readFileSync(commitPath, 'utf8');
    expect(routeSrc).toContain('p_move_log: humanLogPayload.payload');
    expect(routeSrc).toContain('validateRpcMoveLogPayload');
    expect(routeSrc).toContain('commitBotGameTurn');
    expect(commitSrc).toContain('humanMoveLog: humanLogPayload.payload');
    expect(commitSrc).toContain('apply_bot_game_turn_system');
    expect(routeSrc).not.toContain('insertGameMoveLog');
    expect(routeSrc).not.toMatch(/await supabase\.from\('game_move_logs'\)\.insert/);
    expect(commitSrc).not.toMatch(/await supabase\.from\('game_move_logs'\)\.insert/);
    expect(routeSrc).not.toContain('humanLogInsert');
    expect(routeSrc).not.toContain('botLogInsert');
  });
});
