-- ACCL profile identity verification pack
-- Purpose: validate hardened profile identity RPC (void return) + storage posture.
-- Scope: DB columns, RPC access controls, storage bucket/policies, and quick data sanity.
-- Not an executable migration.

-- ============================================================================
-- 1) Confirm profile identity columns exist
-- ============================================================================
select
  c.table_schema,
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'profiles'
  and c.column_name in ('bio', 'avatar_path', 'flag')
order by c.column_name;

-- ============================================================================
-- 2) Confirm hardened RPC overloads exist
-- ============================================================================
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  pg_get_function_result(p.oid) as result_type,
  p.prosecdef as is_security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'update_own_profile_identity'
order by pg_get_function_identity_arguments(p.oid);

-- Expect:
--   update_own_profile_identity(text, text) -> void
--   update_own_profile_identity(text, text, text) -> void
--   optional bio: empty allowed; non-empty bio max 250 words (no minimum)

-- ============================================================================
-- 3) Function execute privileges (expect authenticated only)
-- ============================================================================
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  r.rolname,
  has_function_privilege(r.rolname, p.oid, 'EXECUTE') as can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (values ('public'::name), ('anon'), ('authenticated'), ('service_role')) as roles(rolname)
join pg_roles r on r.rolname = roles.rolname
where n.nspname = 'public'
  and p.proname = 'update_own_profile_identity'
order by p.proname, args, r.rolname;

-- ============================================================================
-- 4) search_path hardening evidence
-- ============================================================================
select
  pg_get_function_identity_arguments(p.oid) as args,
  (
    pg_get_functiondef(p.oid) ilike '%set search_path = pg_catalog, public, pg_temp%'
    or pg_get_functiondef(p.oid) ilike '%set search_path=pg_catalog, public, pg_temp%'
  ) as has_fixed_search_path
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'update_own_profile_identity'
order by 1;

-- ============================================================================
-- 5) Profile avatar bucket configuration
-- ============================================================================
select
  b.id,
  b.name,
  b.public,
  b.file_size_limit,
  b.allowed_mime_types
from storage.buckets b
where b.id = 'profile-avatars';

-- ============================================================================
-- 6) Storage policies for profile avatar bucket
-- ============================================================================
select
  p.schemaname,
  p.tablename,
  p.policyname,
  p.cmd,
  p.roles,
  p.qual,
  p.with_check
from pg_policies p
where p.schemaname = 'storage'
  and p.tablename = 'objects'
  and (
    p.policyname like 'profile_avatars_%'
    or coalesce(p.qual, '') like '%profile-avatars%'
    or coalesce(p.with_check, '') like '%profile-avatars%'
  )
order by p.policyname;

-- ============================================================================
-- 7) Folder-prefix enforcement evidence
-- ============================================================================
select
  p.policyname,
  p.cmd,
  (
    coalesce(p.qual, '') like '%(storage.foldername(name))[1] = auth.uid()::text%'
    or coalesce(p.with_check, '') like '%(storage.foldername(name))[1] = auth.uid()::text%'
  ) as has_uid_folder_prefix_guard
from pg_policies p
where p.schemaname = 'storage'
  and p.tablename = 'objects'
  and p.policyname in (
    'profile_avatars_owner_insert',
    'profile_avatars_owner_update',
    'profile_avatars_owner_delete'
  )
order by p.policyname;

-- ============================================================================
-- 8) Optional data spot-check for one user
-- ============================================================================
with input as (
  select '00000000-0000-0000-0000-000000000000'::uuid as user_id
)
select
  p.id,
  p.username,
  p.bio,
  p.avatar_path,
  p.flag,
  p.created_at
from public.profiles p
join input i on p.id = i.user_id;

-- ============================================================================
-- 9) Public snapshot exposes profile.flag for country/flag pill
-- ============================================================================
select
  pg_get_functiondef(p.oid) ilike '%''flag'', nullif(trim(coalesce(p.flag, '')), '')%'
    as snapshot_includes_flag
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'get_public_profile_snapshot';

-- Spot-check snapshot payload keys (replace uuid):
-- select jsonb_object_keys(public.get_public_profile_snapshot('<profile_id>'::uuid)->'profile');
