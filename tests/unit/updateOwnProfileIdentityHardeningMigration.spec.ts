import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION = '20260621130000_harden_update_own_profile_identity_rpc.sql';

function readMigration(): string {
  return readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8');
}

test.describe('updateOwnProfileIdentityHardeningMigration (static)', () => {
  test('migration filename and transaction wrapper', () => {
    expect(MIGRATION.startsWith('20260621130000')).toBe(true);
    const sql = readMigration();
    expect(sql).toMatch(/\nbegin;\s*\n/i);
    expect(sql.trimEnd().toLowerCase()).toMatch(/commit;\s*$/);
  });

  test('preserves three-argument void signature and hardens body', () => {
    const sql = readMigration();
    expect(sql).toContain('create or replace function public.update_own_profile_identity');
    expect(sql).toMatch(
      /create or replace function public\.update_own_profile_identity\(\s*p_bio text,\s*p_avatar_path text,\s*p_flag text\s*\)/,
    );
    expect(sql).toContain('overload stays unambiguous');
    expect(sql).toContain('returns void');
    expect(sql).toContain('security definer');
    expect(sql).toContain('set search_path = pg_catalog, public, pg_temp');
    expect(sql).toContain("raise exception 'authentication required'");
    expect(sql).toContain('nullif(btrim(coalesce(p_bio');
    expect(sql).toContain('bio exceeds maximum length');
    expect(sql).toContain('Bio must be 150–250 words');
    expect(sql).toContain("v_avatar_path not like (v_uid::text || '/%')");
    expect(sql).toContain("v_flag !~ '^[A-Z]{2}$'");
    expect(sql).toContain('where id = v_uid');
    expect(sql).toContain('profile row not found for authenticated user');
  });

  test('restores two-argument void compatibility wrapper that preserves flag', () => {
    const sql = readMigration();
    expect(sql).toContain('perform public.update_own_profile_identity(p_bio, p_avatar_path, v_existing_flag)');
    expect(sql).toContain('select p.flag');
    expect(sql).toMatch(
      /create or replace function public\.update_own_profile_identity\(\s*p_bio text default null,\s*p_avatar_path text default null\s*\)/,
    );
  });

  test('revokes PUBLIC, anon, and service_role; grants authenticated only', () => {
    const sql = readMigration();
    expect(sql).toContain(
      'revoke all on function public.update_own_profile_identity(text, text, text) from public',
    );
    expect(sql).toContain(
      'revoke all on function public.update_own_profile_identity(text, text, text) from anon',
    );
    expect(sql).toContain(
      'revoke all on function public.update_own_profile_identity(text, text, text) from service_role',
    );
    expect(sql).toContain(
      'grant execute on function public.update_own_profile_identity(text, text, text) to authenticated',
    );
    expect(sql).toContain(
      'revoke all on function public.update_own_profile_identity(text, text) from service_role',
    );
    expect(sql).toContain(
      'grant execute on function public.update_own_profile_identity(text, text) to authenticated',
    );
    expect(sql).not.toContain(
      'grant execute on function public.update_own_profile_identity(text, text, text) to anon',
    );
    expect(sql).not.toContain(
      'grant execute on function public.update_own_profile_identity(text, text, text) to service_role',
    );
  });

  test('retains return-normalization marker', () => {
    const sql = readMigration();
    expect(sql).toContain('ACCL_PROFILE_IDENTITY_RPC_RETURN_NORMALIZATION_REQUIRED');
  });
});
