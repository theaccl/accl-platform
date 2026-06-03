import { expect, test } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '20260621135000_reconcile_profile_identity_schema_prerequisites.sql';
const FOLLOW_UP = '20260621140000_profile_optional_bio_and_public_flag_snapshot.sql';

function readMigration(): string {
  return readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8');
}

function migrationOrder(): string[] {
  return readdirSync(join(process.cwd(), 'supabase', 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

test.describe('profileIdentitySchemaPrerequisiteReconciliation (static)', () => {
  test('migration filename, ordering, and transaction boundary', () => {
    expect(MIGRATION.startsWith('20260621135000')).toBe(true);
    const order = migrationOrder();
    const idx = order.indexOf(MIGRATION);
    const followIdx = order.indexOf(FOLLOW_UP);
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(followIdx).toBeGreaterThan(idx);

    const sql = readMigration();
    expect(sql).toMatch(/\nbegin;\s*\n/i);
    expect(sql.trimEnd().toLowerCase()).toMatch(/commit;\s*$/);
  });

  test('reconciles profile columns idempotently with comments', () => {
    const sql = readMigration();
    expect(sql).toContain('add column if not exists flag text');
    expect(sql).toContain('add column if not exists last_active_at timestamptz');
    expect(sql).toContain(
      'add column if not exists username_change_count int not null default 0',
    );
    expect(sql).toContain('add column if not exists games_played int not null default 0');
    expect(sql).toContain('add column if not exists current_streak int not null default 0');
    expect(sql).toContain('add column if not exists highest_streak int not null default 0');
    expect(sql).toContain('comment on column public.profiles.flag is');
    expect(sql).toContain('comment on column public.profiles.last_active_at is');
    expect(sql).toContain('comment on column public.profiles.username_change_count is');
    expect(sql).toContain('comment on column public.profiles.games_played is');
    expect(sql).toContain('comment on column public.profiles.current_streak is');
    expect(sql).toContain('comment on column public.profiles.highest_streak is');
  });

  test('restores touch_profile_activity with hardened ACL and search_path', () => {
    const sql = readMigration();
    expect(sql).toContain('create or replace function public.touch_profile_activity()');
    expect(sql).toContain('returns void');
    expect(sql).toContain('security definer');
    expect(sql).toContain('set search_path = pg_catalog, public, pg_temp');
    expect(sql).toContain('if v_uid is null then');
    expect(sql).toContain('return;');
    expect(sql).toContain('revoke all on function public.touch_profile_activity() from public');
    expect(sql).toContain('revoke all on function public.touch_profile_activity() from anon');
    expect(sql).toContain(
      'revoke all on function public.touch_profile_activity() from service_role',
    );
    expect(sql).toContain(
      'grant execute on function public.touch_profile_activity() to authenticated',
    );
    expect(sql).not.toMatch(/cascade/i);
  });

  test('documents forward reconciliation without touching later slices', () => {
    const sql = readMigration();
    expect(sql).toContain('ACCL_PROFILE_IDENTITY_SCHEMA_PREREQUISITE_RECONCILIATION');
    expect(sql).toContain('20260518130000');
    expect(sql).toContain('20260621140000');
    expect(sql).toMatch(/Rated Daily Phase A.*is untouched/i);
    expect(sql).not.toMatch(/20260622140000_/);
    expect(sql).not.toMatch(/alter\s+table\s+public\.profiles\s+drop/i);
  });
});
