import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PRIOR_MIGRATION = '20260620140000_free_play_daily_concurrency_authority.sql';
const MIGRATION = '20260622140000_free_play_rated_daily_ticket_ledger_phase_a_foundation.sql';
const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function readMigration(): string {
  return readFileSync(join(MIGRATIONS_DIR, MIGRATION), 'utf8');
}

function readPriorMigration(): string {
  return readFileSync(join(MIGRATIONS_DIR, PRIOR_MIGRATION), 'utf8');
}

test.describe('freePlayRatedDailyTicketLedgerPhaseAMigration (static)', () => {
  test('follow-on migration exists exactly once and sorts after daily concurrency authority', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    expect(files.filter((f) => f === MIGRATION)).toHaveLength(1);
    expect(MIGRATION > PRIOR_MIGRATION).toBe(true);
  });

  test('does not edit prior migration file contents', () => {
    const prior = readPriorMigration();
    expect(prior).toContain('trg_games_enforce_free_daily_concurrency');
    expect(prior).not.toContain('free_play_rated_daily_ticket_ledger_phase_a_foundation');
  });

  test('wraps DDL in explicit transaction (begin/commit)', () => {
    const sql = readMigration();
    expect(sql).toMatch(/\nbegin;\s*\n/i);
    expect(sql.trimEnd().toLowerCase()).toMatch(/commit;\s*$/);
  });

  test('creates user_entitlements with rated_play_unlock and tournament_unlock keys', () => {
    const sql = readMigration();
    expect(sql).toContain('create table if not exists public.user_entitlements');
    expect(sql).toContain("'rated_play_unlock'");
    expect(sql).toContain("'tournament_unlock'");
    expect(sql).not.toMatch(/0\.99|1\.99|\$[0-9]/);
  });

  test('creates queue metadata without lane column; includes origin_utc_day and expires_at', () => {
    const sql = readMigration();
    expect(sql).toContain('create table if not exists public.free_play_rated_daily_queue_meta');
    expect(sql).toContain('origin_utc_day date not null');
    expect(sql).toContain('expires_at timestamptz not null');
    expect(sql).not.toMatch(/\bqueue_lane\s+(text|varchar)/i);
  });

  test('creates free position ledger with auditable states and position_no 1-5', () => {
    const sql = readMigration();
    expect(sql).toContain('create table if not exists public.free_play_rated_daily_position_ledger');
    expect(sql).toContain("state in ('waiting', 'committed', 'released')");
    expect(sql).toContain("source_kind in ('public_post', 'public_accept', 'direct_challenge_accept')");
    expect(sql).toContain('position_no between 1 and 5');
  });

  test('creates challenge metadata foundation table', () => {
    const sql = readMigration();
    expect(sql).toContain('create table if not exists public.free_play_rated_daily_challenge_meta');
    expect(sql).toContain('match_request_id uuid primary key');
  });

  test('tournament exclusion remains explicit in read RPC', () => {
    const sql = readMigration();
    expect(sql).toContain('g.tournament_id is null');
    expect(sql).not.toContain('mr.tournament_id');
    expect(sql.match(/tournament_id is null/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  test('no checkout logic, trigger rewrite, or cron wiring', () => {
    const sql = readMigration();
    expect(sql).not.toContain('trg_games_enforce_free_daily_concurrency');
    expect(sql).not.toContain('free_play_assert_daily_cap');
    expect(sql).not.toContain('create_seated_game_guard');
    expect(sql).not.toMatch(/cron|vercel\.json|expire_open_seats\(/i);
    expect(sql).not.toMatch(/stripe|payment_webhook|checkout_session/i);
  });

  test('restricts shelf expiry helper execution to service_role only', () => {
    const sql = readMigration();
    expect(sql).toContain(
      'revoke all on function public.free_play_rated_daily_shelf_expires_at(date) from public',
    );
    expect(sql).toContain(
      'revoke all on function public.free_play_rated_daily_shelf_expires_at(date) from anon, authenticated',
    );
    expect(sql).toContain(
      'grant execute on function public.free_play_rated_daily_shelf_expires_at(date) to service_role',
    );
    expect(sql).not.toContain(
      'grant execute on function public.free_play_rated_daily_shelf_expires_at(date) to authenticated',
    );
    expect(sql).not.toMatch(
      /grant execute on function public\.free_play_rated_daily_shelf_expires_at\(date\) to anon/i,
    );
  });

  test('read RPC is read-only and uses hardened SECURITY DEFINER search_path', () => {
    const sql = readMigration();
    expect(sql).toContain('create or replace function public.free_play_read_rated_daily_usage_strip');
    expect(sql).toContain('security definer');
    expect(sql).toContain('set search_path = pg_catalog, pg_temp');
    expect(sql).toContain('revoke all on function public.free_play_read_rated_daily_usage_strip');
    expect(sql).toContain('grant execute on function public.free_play_read_rated_daily_usage_strip(uuid) to authenticated');
    expect(sql).toContain('grant execute on function public.free_play_read_rated_daily_usage_strip(uuid) to service_role');
    expect(sql).not.toContain('grant execute on function public.free_play_read_rated_daily_usage_strip(uuid) to anon');
  });

  test('retains future marker comments', () => {
    const sql = readMigration();
    expect(sql).toContain('ACCL_RATED_TICKET_PUNCH_VISUAL_UPGRADE_REQUIRED');
    expect(sql).toContain('ACCL_PAID_UNLOCK_CHECKOUT_REQUIRED');
  });
});
