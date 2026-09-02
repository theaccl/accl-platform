import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  buildBotTurnReservationRpcParams,
  parseAppliedQueuedBotTurn,
  parseReservedBotTurn,
} from '@/lib/replay/botTurnDurabilityRpc';
import { processNextBotMoveRecoveryJob } from '@/lib/server/botMoveRecoveryWorker';

const GAME_ID = '00000000-0000-4000-8000-000000000001';
const JOB_ID = '00000000-0000-4000-8000-000000000002';
const HUMAN_ID = '00000000-0000-4000-8000-000000000003';
const BOT_ID = '00000000-0000-4000-8000-000000000004';
const POST_HUMAN_FEN = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';

test.describe('durable bot-turn RPC contract', () => {
  test('builds the human reservation with the human idempotency key', () => {
    const params = buildBotTurnReservationRpcParams({
      gameId: GAME_ID,
      expectedFen: 'before',
      humanPatch: {
        fen: POST_HUMAN_FEN,
        turn: 'black',
        lastMoveAt: '2026-09-02T12:00:00.000Z',
        moveDeadlineAt: '2026-09-02T12:05:00.000Z',
        whiteClockMs: 299_000,
        blackClockMs: 300_000,
        promoteWaitingToActive: false,
      },
      humanMoveLog: {
        game_id: GAME_ID,
        player_id: HUMAN_ID,
        san: 'e4',
        from_sq: 'e2',
        to_sq: 'e4',
        fen_before: 'before',
        fen_after: POST_HUMAN_FEN,
        move_duration_ms: 1_000,
        idempotency_key: 'cm:human-1',
      },
      correlationId: 'corr-1',
    });

    expect(params.p_human_move_log.idempotency_key).toBe('cm:human-1');
    expect(params.p_human_next_fen).toBe(POST_HUMAN_FEN);
  });

  test('rejects malformed reservation and queued-commit responses', () => {
    expect(parseReservedBotTurn(null)).toBeNull();
    expect(parseReservedBotTurn({ game: {}, job_id: '' })).toBeNull();
    expect(parseAppliedQueuedBotTurn({ game: null })).toBeNull();
    expect(
      parseAppliedQueuedBotTurn({
        game: { id: GAME_ID },
        bot_move_applied: false,
        timed_out: true,
        job_status: 'completed',
      }),
    ).toMatchObject({ botMoveApplied: false, timedOut: true, jobStatus: 'completed' });
  });

  test('migration locks job and game before timeout or bot mutation', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '20260902120000_bot_turn_durable_clock_authority.sql'),
      'utf8',
    );
    const reserveApply = sql.indexOf('g := public.apply_bot_game_turn_system(');
    const reserveInsert = sql.indexOf('insert into public.bot_move_jobs');
    const jobLock = sql.indexOf('where id = p_job_id\n  for update;');
    const gameLock = sql.indexOf('where id = j.game_id\n  for update;');
    const expiry = sql.indexOf('v_flagged := public.bot_turn_flagged_loser(');
    const botApply = sql.indexOf('g := public.apply_bot_game_turn_system(', expiry);

    expect(reserveApply).toBeGreaterThan(-1);
    expect(reserveInsert).toBeGreaterThan(reserveApply);
    expect(jobLock).toBeGreaterThan(reserveInsert);
    expect(gameLock).toBeGreaterThan(jobLock);
    expect(expiry).toBeGreaterThan(gameLock);
    expect(botApply).toBeGreaterThan(expiry);
    expect(sql).toContain("status = 'queued'");
    expect(sql).toContain('for update skip locked');
    expect(sql).toContain('and q.attempt_count < 5');
    expect(sql).toContain('order by q.updated_at asc, q.created_at asc');
    expect(sql).toContain("status = case when attempt_count >= 5 then 'failed' else 'queued' end");
    expect(sql).toContain("raise exception 'bot_move_payload_required'");
    expect(sql).toContain("if j.status = 'cancelled' then\n    raise exception 'bot_job_cancelled'");
    expect(sql).toContain("raise exception 'bot_turn_tournament_forbidden'");
    expect(sql).toContain("coalesce(g.play_context, 'free') is distinct from 'free'");
    expect(sql).toContain('g.tournament_id is not null');
    expect(sql.indexOf("raise exception 'bot_move_payload_required'")).toBeGreaterThan(expiry);
  });

  test('clock sweep reports durable recovery errors as unavailable', () => {
    const route = readFileSync(
      join(process.cwd(), 'app', 'api', 'internal', 'live-clock-timeout', 'process', 'route.ts'),
      'utf8',
    );

    expect(route).toContain('const recoveryFailed = Boolean(botRecovery.error)');
    expect(route).toContain('status: sweepError || recoveryFailed ? 503 : 200');
  });

  test('RPCs stay service-role only and never expose the queue to clients', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '20260902120000_bot_turn_durable_clock_authority.sql'),
      'utf8',
    );

    for (const fn of [
      'reserve_bot_game_turn_system',
      'apply_queued_bot_move_system',
      'release_bot_move_job',
      'cancel_bot_move_job',
      'recover_stale_bot_move_jobs',
    ]) {
      expect(sql).toContain(`grant execute on function public.${fn}`);
    }
    expect(sql.match(/from public, anon, authenticated/g)?.length).toBeGreaterThanOrEqual(5);
    expect(sql).not.toContain('grant execute on function public.reserve_bot_game_turn_system(\n  uuid, text, text, text, timestamptz, timestamptz, integer, integer, boolean, jsonb, text\n) to authenticated');
  });
});

function fakeRecoveryClient(options: {
  commitFailure?: boolean;
  permanentCommitFailure?: boolean;
  commitThrows?: boolean;
  attemptCount?: number;
}) {
  const calls: Array<{ fn: string; args?: Record<string, unknown> }> = [];
  const game = {
    id: GAME_ID,
    fen: POST_HUMAN_FEN,
    turn: 'black',
    status: 'active',
    source_type: 'bot_game',
    white_player_id: HUMAN_ID,
    black_player_id: BOT_ID,
    bot_settings: {
      version: 'accl_bot_v1',
      difficulty: 3,
      personalityStyle: 'balanced',
      opponentLabel: 'Computer',
    },
  };
  const log = {
    game_id: GAME_ID,
    player_id: HUMAN_ID,
    san: 'e4',
    from_sq: 'e2',
    to_sq: 'e4',
    fen_before: 'before',
    fen_after: POST_HUMAN_FEN,
    move_duration_ms: 500,
    idempotency_key: 'cm:human-1',
  };
  const client = {
    rpc: async (fn: string, args?: Record<string, unknown>) => {
      calls.push({ fn, args });
      if (fn === 'recover_stale_bot_move_jobs') return { data: 1, error: null };
      if (fn === 'claim_next_bot_move_job') {
        return {
          data: {
            id: JOB_ID,
            game_id: GAME_ID,
            status: 'running',
            post_human_fen: POST_HUMAN_FEN,
            bot_player_id: BOT_ID,
            idempotency_key: 'cm:human-1',
            attempt_count: options.attemptCount ?? 1,
          },
          error: null,
        };
      }
      return { data: true, error: null };
    },
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: table === 'games' ? game : log, error: null }),
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  const commit = async () => {
    if (options.commitThrows) throw new Error('injected_worker_crash');
    if (options.permanentCommitFailure) {
      return { ok: false, kind: 'bot_no_candidates', message: 'no_legal_candidate' } as const;
    }
    if (options.commitFailure) {
      return { ok: false, kind: 'commit_failed', message: 'injected_commit_failure' } as const;
    }
    return {
      ok: true,
      finalRow: game,
      botMoveApplied: true,
      thinkMs: 100,
      humanWasIdempotentDuplicate: true,
    } as const;
  };
  return { client, calls, commit };
}

test.describe('bot-turn recovery failure injection', () => {
  test('requeues a claimed job when authoritative commit fails', async () => {
    const fake = fakeRecoveryClient({ commitFailure: true });
    const result = await processNextBotMoveRecoveryJob(fake.client, {
      commit: fake.commit,
    });

    expect(result).toMatchObject({ recoveredStale: 1, claimed: true, outcome: 'requeued' });
    expect(fake.calls.map((call) => call.fn)).toEqual([
      'recover_stale_bot_move_jobs',
      'claim_next_bot_move_job',
      'release_bot_move_job',
    ]);
  });

  test('requeues a claimed job after an injected worker crash', async () => {
    const fake = fakeRecoveryClient({ commitThrows: true });
    const result = await processNextBotMoveRecoveryJob(fake.client, {
      commit: fake.commit,
    });

    expect(result.error).toBe('injected_worker_crash');
    expect(fake.calls.at(-1)?.fn).toBe('release_bot_move_job');
  });

  test('fails an exhausted transient job instead of starving newer work', async () => {
    const fake = fakeRecoveryClient({ commitThrows: true, attemptCount: 5 });
    const result = await processNextBotMoveRecoveryJob(fake.client, {
      commit: fake.commit,
    });

    expect(result).toMatchObject({ outcome: 'failed', error: 'injected_worker_crash' });
    expect(fake.calls.at(-1)?.fn).toBe('release_bot_move_job');
  });

  test('cancels deterministic permanent failures immediately', async () => {
    const fake = fakeRecoveryClient({ permanentCommitFailure: true });
    const result = await processNextBotMoveRecoveryJob(fake.client, {
      commit: fake.commit,
    });

    expect(result).toMatchObject({ outcome: 'cancelled', error: 'no_legal_candidate' });
    expect(fake.calls.at(-1)?.fn).toBe('cancel_bot_move_job');
  });

  test('leaves successful job completion to the atomic database RPC', async () => {
    const fake = fakeRecoveryClient({});
    const result = await processNextBotMoveRecoveryJob(fake.client, {
      commit: fake.commit,
    });

    expect(result).toMatchObject({ recoveredStale: 1, claimed: true, outcome: 'completed' });
    expect(fake.calls.some((call) => call.fn === 'release_bot_move_job')).toBe(false);
  });
});

test.describe('bot-turn request recovery contract', () => {
  test('reuses the probed SAN when retrying an already-reserved human ply', () => {
    const route = readFileSync(
      join(process.cwd(), 'app', 'api', 'game', 'submit-move', 'route.ts'),
      'utf8',
    );

    expect(route).toContain('recoveredHumanSan = probeMove.san');
    expect(route).toContain('humanSan: recoveredHumanSan');
    expect(route).toContain(".from('bot_move_jobs')");
    expect(route).toContain("status !== 'completed'");
    expect(route).toContain('recoveredStale.completedBotTurn');
  });

  test('returns the authoritative reserved human row when bot completion fails', () => {
    const route = readFileSync(
      join(process.cwd(), 'app', 'api', 'game', 'submit-move', 'route.ts'),
      'utf8',
    );
    const failureBranch = route.slice(
      route.indexOf("auditApiLog('submit_move', { result: 'move_commit_failed'"),
      route.indexOf('const elapsedBot'),
    );

    expect(failureBranch).toContain('if (botResult.humanMoveApplied && botResult.humanRow)');
    expect(failureBranch).toContain('human_move_applied: true');
    expect(failureBranch).toContain('row: botResult.humanRow');
  });

  test('marks partial success only after a durable reservation or authoritative retry', () => {
    const commit = readFileSync(
      join(process.cwd(), 'lib', 'server', 'submitMoveBotGameCommit.ts'),
      'utf8',
    );

    expect(commit).toContain(
      'humanRow: reservedJobId || humanAlreadyCommitted ? postHumanRow : undefined',
    );
    expect(commit).toContain(
      'humanMoveApplied: Boolean(reservedJobId || humanAlreadyCommitted)',
    );
    expect(commit).not.toContain(
      "message: 'Move could not be committed. Refresh and try again.',\n        humanRow: postHumanRow",
    );
  });
});
