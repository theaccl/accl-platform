import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const migration = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260830185514_image_generator_slice_1_foundation.sql'
);
const hardeningMigration = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260830201229_image_generator_slice_1_advisor_hardening.sql'
);

test('migration locks membership, candidate, and placement contracts', async () => {
  const sql = (await readFile(migration, 'utf8')).toLowerCase();
  expect(sql).toContain("entitlement in ('image_generator', 'profile_motion')");
  expect(sql).toContain('candidate_count between 1 and 4');
  expect(sql).toContain("now() + interval '24 hours'");
  expect(sql).toContain("surface in ('profile_image', 'profile_background')");
  expect(sql).toContain('still_only_in_community boolean not null default true');
  expect(sql).toContain('motion_enabled_on_profile boolean not null default false');
});

test('candidate storage is private and access is server mediated', async () => {
  const sql = (await readFile(migration, 'utf8')).toLowerCase();
  expect(sql).toContain("'image-generation-candidates'");
  expect(sql).toContain("'image-generation-candidates',\n  false,");
  expect(sql).toContain('only the server service role may upload/download/sign candidate objects');
  expect(sql).not.toContain('create policy image_generation_candidates_storage');
});

test('all new public tables have RLS and explicit grants', async () => {
  const sql = (await readFile(migration, 'utf8')).toLowerCase();
  for (const table of [
    'membership_entitlements',
    'image_generation_requests',
    'image_generation_candidates',
    'image_generation_approval_events',
    'profile_imagery_assignments',
  ]) {
    expect(sql).toContain(`alter table public.${table} enable row level security`);
    expect(sql).toContain(`revoke all on public.${table} from anon, authenticated`);
    expect(sql).toContain(`grant all on public.${table} to service_role`);
  }
});

test('worker claim and approval transitions are database atomic', async () => {
  const sql = (await readFile(migration, 'utf8')).toLowerCase();
  expect(sql).toContain('for update skip locked');
  expect(sql).toContain('create or replace function public.approve_image_generation_candidate');
  expect(sql).toContain("set status = case when id = p_candidate_id then 'approved' else 'rejected' end");
  expect(sql).toContain("set status = 'approved', updated_at = now()");
});

test('security-definer functions are not callable by public', async () => {
  const sql = (await readFile(migration, 'utf8')).toLowerCase();
  for (const fn of [
    'create_image_generation_request',
    'claim_next_image_generation_request',
    'register_image_generation_candidate',
    'finalize_image_generation_request',
    'approve_image_generation_candidate',
    'cancel_image_generation_request',
    'place_approved_profile_image',
  ]) {
    expect(sql).toContain(`revoke all on function public.${fn}`);
  }
});

test('advisor hardening optimizes ownership policies and public imagery reads', async () => {
  const sql = (await readFile(hardeningMigration, 'utf8')).toLowerCase();
  expect(sql).toContain('using (user_id = (select auth.uid()))');
  expect(sql).toContain('using (owner_id = (select auth.uid()))');
  expect(sql).toContain('image_generation_approval_events_request_created_idx');
  expect(sql).toContain('profile_imagery_assignments_candidate_idx');
  expect(sql).toContain('grant select (id, avatar_path, profile_background_path) on public.profiles to anon');
  expect(sql).toContain('alter function public.get_public_profile_imagery(uuid) security invoker');
});
