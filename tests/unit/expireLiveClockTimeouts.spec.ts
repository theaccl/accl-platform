import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20260602120000_expire_live_clock_timeouts.sql',
);
const provenancePath = join(
  process.cwd(),
  'supabase/migrations/20260522180000_provenance_apply_free_play_rating_update_core_return_path.sql',
);
const routePath = join(
  process.cwd(),
  'app/api/internal/live-clock-timeout/process/route.ts',
);

test.describe('expire_live_clock_timeouts migration (static)', () => {
  test('defines RPC with security definer, skip locked, and timeout finish', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('create or replace function public.expire_live_clock_timeouts');
    expect(sql).toContain('security definer');
    expect(sql).toContain('for update skip locked');
    expect(sql).toContain("perform public.finish_game_system(r.id, v_result, 'timeout')");
    expect(sql).toContain("when 'white' then 'black_win'");
    expect(sql).toContain("else 'white_win'");
    expect(sql).toContain('grant execute on function public.expire_live_clock_timeouts(integer) to service_role');
    expect(sql).toContain('revoke all on function public.expire_live_clock_timeouts(integer) from public');
  });

  test('scopes sweep to free live seated post-move active games', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain("g.play_context = 'free'");
    expect(sql).toContain('g.tournament_id is null');
    expect(sql).toContain("lower(btrim(coalesce(g.tempo, ''))) = 'live'");
    expect(sql).toContain('g.last_move_at is not null');
    expect(sql).toContain('live_clock_flagged_loser');
    expect(sql).toContain('clock_budget_ms_for_live_sweep');
  });

  test('adds partial index for sweep candidates', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('games_free_live_active_seated_sweep_idx');
  });

  test('rating return-path provenance migration remains in repo', () => {
    const sql = readFileSync(provenancePath, 'utf8');
    expect(sql).toContain('apply_free_play_rating_update_core');
    expect(sql).toContain('finish_game_system');
  });
});

test.describe('live clock timeout sweep route (static)', () => {
  test('internal route uses secret auth and expire_live_clock_timeouts RPC', () => {
    const src = readFileSync(routePath, 'utf8');
    expect(src).toContain('verifyLiveTimeoutSweepSecret');
    expect(src).toContain('createServiceRoleClient');
    expect(src).toContain("rpc('expire_live_clock_timeouts'");
    expect(src).toContain('export async function GET');
    expect(src).toContain('export async function POST');
    expect(src).toContain('finished');
    expect(src).toContain('rounds');
    expect(src).not.toContain('NEXT_PUBLIC');
  });

  test('vercel cron schedules live timeout sweep every 2 minutes', () => {
    const vercel = readFileSync(join(process.cwd(), 'vercel.json'), 'utf8');
    expect(vercel).toContain('/api/internal/live-clock-timeout/process');
    expect(vercel).toContain('*/2 * * * *');
  });
});
