-- ACCL identity schema reconciliation pack
-- Use when profile/vault pages report missing table schema-cache errors.
--
-- Target tables:
--   public.vault_relic_records
--   public.trophy_records
--   public.prestige_profile_frames

-- ============================================================================
-- 1) Confirm table existence in live DB
-- ============================================================================
select
  t.table_schema,
  t.table_name
from information_schema.tables t
where t.table_schema = 'public'
  and t.table_name in (
    'vault_relic_records',
    'trophy_records',
    'prestige_profile_frames'
  )
order by t.table_name;

-- ============================================================================
-- 2) Confirm RLS + select policies exist for the identity tables
-- ============================================================================
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls_for_table_owner
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'vault_relic_records',
    'trophy_records',
    'prestige_profile_frames'
  )
order by c.relname;

select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'vault_relic_records',
    'trophy_records',
    'prestige_profile_frames'
  )
order by tablename, policyname;

-- ============================================================================
-- 3) Confirm reconciliation/public RPCs exist (optional sanity)
-- ============================================================================
select
  p.proname,
  p.prosecdef as is_security_definer,
  oidvectortypes(p.proargtypes) as arg_types
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'get_public_profile_snapshot',
    'get_public_profile_history'
  )
order by p.proname;

-- ============================================================================
-- 4) Migration presence check (Supabase migration history)
--    Run this if your project has `supabase_migrations.schema_migrations`.
-- ============================================================================
-- select version, name, inserted_at
-- from supabase_migrations.schema_migrations
-- where version in (
--   '20260412120000',
--   '20260417120000',
--   '20260420120000'
-- )
-- order by version;

-- ============================================================================
-- 5) Schema cache reload hint (PostgREST)
--    Usually automatic after DDL; run only if cache appears stale.
-- ============================================================================
-- NOTIFY pgrst, 'reload schema';
