-- ACCL profile identity verification pack
-- Purpose: validate editable profile identity foundation (bio + avatar).
-- Scope: DB columns, RPC access controls, storage bucket/policies, and quick data sanity.

-- ============================================================================
-- 0) Migration presence check (optional; if table exists in your project)
-- ============================================================================
-- select version, name, inserted_at
-- from supabase_migrations.schema_migrations
-- where version in ('20260425120000')
-- order by version;

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
  and c.column_name in ('bio', 'avatar_path')
order by c.column_name;

-- ============================================================================
-- 2) Confirm RPC exists with expected security/access posture
-- ============================================================================
select
  n.nspname as schema_name,
  p.proname as function_name,
  p.prosecdef as is_security_definer,
  oidvectortypes(p.proargtypes) as arg_types
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'update_own_profile_identity';

-- Function grants (expect execute for authenticated, none for anon/public)
select
  r.routine_schema,
  r.routine_name,
  r.grantee,
  r.privilege_type
from information_schema.routine_privileges r
where r.routine_schema = 'public'
  and r.routine_name = 'update_own_profile_identity'
order by r.grantee, r.privilege_type;

-- Optional: inspect exact function body
select pg_get_functiondef('public.update_own_profile_identity(text, text)'::regprocedure) as function_sql;

-- ============================================================================
-- 3) Confirm profile avatar bucket configuration
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
-- 4) Confirm storage policies for profile avatar bucket
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
-- 5) Folder-prefix enforcement evidence (policy text should include this)
--    Expected expression fragment:
--      (storage.foldername(name))[1] = auth.uid()::text
-- ============================================================================
select
  p.policyname,
  p.cmd,
  p.qual,
  p.with_check,
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
-- 6) Public profile read-model exposure sanity
--    Expect profile payload keys include "bio" and "avatar_path" only for public identity,
--    and no private account fields like email.
-- ============================================================================
-- Replace with a real profile id before running.
with input as (
  select '00000000-0000-0000-0000-000000000000'::uuid as profile_id
)
select
  jsonb_object_keys(public.get_public_profile_snapshot(i.profile_id)->'profile') as profile_payload_key
from input i
order by 1;

-- ============================================================================
-- 7) Optional data spot-check for one user
--    Replace USER_ID before running.
-- ============================================================================
with input as (
  select '00000000-0000-0000-0000-000000000000'::uuid as user_id
)
select
  p.id,
  p.username,
  p.bio,
  p.avatar_path,
  p.created_at
from public.profiles p
join input i on p.id = i.user_id;
