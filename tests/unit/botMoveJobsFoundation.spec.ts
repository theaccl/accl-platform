import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isBotMoveQueueEnabled, isBotMoveQueueShadowEnabled } from '@/lib/bot/botMoveQueueFeature';
import { BOT_MOVE_JOB_STATUSES, isBotMoveJobStatus } from '@/lib/bot/botMoveJobTypes';

const MIGRATION = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260531180000_bot_move_jobs_queue_foundation.sql',
);

test.describe('bot_move_jobs queue foundation (Phase 1I-a)', () => {
  test('migration defines table, indexes, and RPCs', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    expect(sql).toContain('create table if not exists public.bot_move_jobs');
    expect(sql).toContain('bot_move_jobs_game_id_idempotency_key_uq');
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('grant select, insert, update on public.bot_move_jobs to service_role');
    expect(sql).toContain('create or replace function public.enqueue_bot_move_job');
    expect(sql).toContain('create or replace function public.claim_next_bot_move_job');
    expect(sql).toContain('for update skip locked');
    expect(sql).toContain('create or replace function public.complete_bot_move_job');
    expect(sql).toContain('create or replace function public.fail_bot_move_job');
    expect(sql).toContain('create or replace function public.fail_stale_running_bot_move_jobs');
    expect(sql).toContain('create or replace function public.get_bot_move_job_for_game');
    expect(sql).toContain("status in ('queued', 'running', 'completed', 'failed', 'cancelled')");
    expect(sql).toContain("raise exception 'not_bot_game'");
  });

  test('RPCs are service_role only', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    const rpcNames = [
      'enqueue_bot_move_job',
      'claim_next_bot_move_job',
      'complete_bot_move_job',
      'fail_bot_move_job',
      'fail_stale_running_bot_move_jobs',
      'get_bot_move_job_for_game',
    ];
    for (const name of rpcNames) {
      expect(sql).toContain(`grant execute on function public.${name}`);
      expect(sql).toContain(`revoke all on function public.${name}`);
    }
  });

  test('feature flag defaults off', () => {
    const prev = process.env.BOT_MOVE_QUEUE_ENABLED;
    delete process.env.BOT_MOVE_QUEUE_ENABLED;
    expect(isBotMoveQueueEnabled()).toBe(false);
    process.env.BOT_MOVE_QUEUE_ENABLED = '0';
    expect(isBotMoveQueueEnabled()).toBe(false);
    process.env.BOT_MOVE_QUEUE_ENABLED = '1';
    expect(isBotMoveQueueEnabled()).toBe(true);
    if (prev === undefined) delete process.env.BOT_MOVE_QUEUE_ENABLED;
    else process.env.BOT_MOVE_QUEUE_ENABLED = prev;
  });

  test('job status helper recognizes allowed values', () => {
    expect(BOT_MOVE_JOB_STATUSES).toContain('queued');
    expect(isBotMoveJobStatus('running')).toBe(true);
    expect(isBotMoveJobStatus('bogus')).toBe(false);
  });

  test('submit-move has no async queue cutover (shadow uses dedicated RPC)', () => {
    const routeSrc = readFileSync(
      join(process.cwd(), 'app', 'api', 'game', 'submit-move', 'route.ts'),
      'utf8',
    );
    const commitSrc = readFileSync(
      join(process.cwd(), 'lib', 'server', 'submitMoveBotGameCommit.ts'),
      'utf8',
    );
    const shadowSrc = readFileSync(
      join(process.cwd(), 'lib', 'server', 'botMoveJobShadow.ts'),
      'utf8',
    );
    expect(routeSrc).not.toContain('enqueue_bot_move_job');
    expect(routeSrc).not.toContain('isBotMoveQueueEnabled');
    expect(shadowSrc).toContain('record_bot_move_job_shadow_system');
    expect(commitSrc).toContain('recordShadowBotMoveJob');
    expect(commitSrc).not.toContain('claim_next_bot_move_job');
    expect(commitSrc).toContain('apply_bot_game_turn_system');
  });

  test('BOT_MOVE_QUEUE_SHADOW defaults off', () => {
    const prev = process.env.BOT_MOVE_QUEUE_SHADOW;
    delete process.env.BOT_MOVE_QUEUE_SHADOW;
    expect(isBotMoveQueueShadowEnabled()).toBe(false);
    if (prev === undefined) delete process.env.BOT_MOVE_QUEUE_SHADOW;
    else process.env.BOT_MOVE_QUEUE_SHADOW = prev;
  });

  test('no internal bot-move processor route in 1I-a', () => {
    const glob = readFileSync(join(process.cwd(), 'app', 'api', 'game', 'submit-move', 'route.ts'), 'utf8');
    expect(glob).not.toContain('/api/internal/bot-move-queue');
  });
});
