import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '20260713120000_player_presence_heartbeat_foundation.sql';
const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function readMigration(): string {
  return readFileSync(join(MIGRATIONS_DIR, MIGRATION), 'utf8');
}

function sliceFunction(sql: string, name: string): string {
  const start = sql.indexOf(`function public.${name}`);
  const end = sql.indexOf('$$;', start);
  return sql.slice(start, end === -1 ? undefined : end);
}

test.describe('playerPresenceHeartbeatFoundationMigration (static)', () => {
  test('migration exists and sorts after latest 202607 migration', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    expect(files).toContain(MIGRATION);
    expect(MIGRATION > '20260707160000_successful_performance_helper_privilege_hardening.sql').toBe(
      true,
    );
  });

  test('wraps DDL in explicit transaction (begin/commit)', () => {
    const sql = readMigration();
    expect(sql).toMatch(/\nbegin;\s*\n/i);
    expect(sql.trimEnd().toLowerCase()).toMatch(/commit;\s*$/);
  });

  test('creates player_presence_tabs with required columns and RLS enabled', () => {
    const sql = readMigration();
    expect(sql).toContain('create table if not exists public.player_presence_tabs');
    for (const col of [
      'id uuid primary key',
      'user_id uuid not null',
      'auth_session_id uuid not null',
      'tab_presence_id uuid not null',
      'last_heartbeat_at timestamptz not null',
      'last_interaction_at timestamptz',
      'visibility_state text not null',
      'ended_at timestamptz',
      'end_reason text',
      'created_at timestamptz not null',
      'updated_at timestamptz not null',
    ]) {
      expect(sql).toContain(col);
    }
    expect(sql).toContain('enable row level security');
  });

  test('composite uniqueness and visibility constraint exist', () => {
    const sql = readMigration();
    expect(sql).toContain('player_presence_tabs_user_session_tab_uq');
    expect(sql).toContain("visibility_state in ('visible', 'hidden')");
  });

  test('foreign key references profiles and indexes support aggregation and stale scan', () => {
    const sql = readMigration();
    expect(sql).toContain('references public.profiles (id) on delete cascade');
    expect(sql).toContain('player_presence_tabs_user_id_open_idx');
    expect(sql).toContain('player_presence_tabs_stale_open_idx');
    expect(sql).toContain('player_presence_tabs_session_tab_idx');
  });

  test('direct public writes are not granted on the table', () => {
    const sql = readMigration();
    expect(sql).toContain('revoke all on table public.player_presence_tabs from public');
    expect(sql).toContain('revoke all on table public.player_presence_tabs from anon');
    expect(sql).toContain('revoke all on table public.player_presence_tabs from authenticated');
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)\s+on\s+table\s+public\.player_presence_tabs/i);
  });

  test('heartbeat function derives auth identity from auth.uid and JWT session_id', () => {
    const fn = sliceFunction(readMigration(), 'upsert_player_presence_heartbeat');
    expect(fn).toContain('v_uid := auth.uid()');
    expect(fn).toContain("auth.jwt() ->> 'session_id'");
    expect(fn).toContain("raise exception 'authentication_required'");
    expect(fn).toContain("raise exception 'session_id_required'");
    expect(fn).not.toMatch(/p_auth_session_id|p_session_id|p_user_id/i);
  });

  test('server now() drives heartbeat timestamps and false interaction preserves last_interaction_at', () => {
    const fn = sliceFunction(readMigration(), 'upsert_player_presence_heartbeat');
    expect(fn).toContain('v_now timestamptz := now()');
    expect(fn).toContain('last_heartbeat_at = v_now');
    expect(fn).toContain('when p_interaction then v_now');
    expect(fn).toContain('else public.player_presence_tabs.last_interaction_at');
  });

  test('profiles.last_active_at is interaction-driven or throttled to ~2 minutes', () => {
    const fn = sliceFunction(readMigration(), 'upsert_player_presence_heartbeat');
    expect(fn).toContain('if p_interaction then');
    expect(fn).toContain("interval '2 minutes'");
    expect(fn).toContain('update public.profiles');
  });

  test('RPC is SECURITY DEFINER with hardened search_path and authenticated-only execute', () => {
    const sql = readMigration();
    const fn = sliceFunction(sql, 'upsert_player_presence_heartbeat');
    expect(fn).toMatch(/security definer/i);
    expect(fn).toContain('set search_path = pg_catalog, public, pg_temp');
    expect(sql).toContain(
      'revoke all on function public.upsert_player_presence_heartbeat(uuid, text, boolean) from public',
    );
    expect(sql).toContain(
      'revoke all on function public.upsert_player_presence_heartbeat(uuid, text, boolean) from anon',
    );
    expect(sql).toContain(
      'revoke all on function public.upsert_player_presence_heartbeat(uuid, text, boolean) from service_role',
    );
    expect(sql).toContain(
      'grant execute on function public.upsert_player_presence_heartbeat(uuid, text, boolean) to authenticated',
    );
  });

  test('no open-seat, logout cleanup, cron, or sweep behavior appears in migration', () => {
    const ddl = readMigration().replace(/--[^\n]*/g, '').toLowerCase();
    const banned = [
      'open_seat',
      'withdraw',
      'log_out_all',
      'cron',
      'pg_cron',
      'touch_profile_activity',
      'profileactivitylight',
      'hostliveopenseat',
      'freeplayfindmatch',
    ];
    for (const term of banned) {
      expect(ddl, term).not.toContain(term);
    }
    expect(ddl).not.toMatch(/update\s+public\.games/);
    expect(ddl).not.toMatch(/update\s+public\.match_requests/);
    expect(ddl).not.toContain('delete from public.player_presence_tabs');
  });
});
