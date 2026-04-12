-- ACCL — manual Supabase verification pack (Phase 6 SQL; Phase 7 runbook)
-- Paste blocks into Supabase SQL Editor (or run via psql against the project DB).
-- This inspects the *deployed* database, not the git tree.
-- Operator steps + interpretation: supabase/OPERATOR_RUNBOOK.md

-- =============================================================================
-- A) Row Level Security: is it enabled?
-- =============================================================================
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls_for_table_owner
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in ('games', 'match_requests', 'game_move_logs', 'profiles')
order by c.relname;

-- =============================================================================
-- B) Policies on key tables (full detail)
-- =============================================================================
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd as command,
  qual as using_expression,
  with_check as with_check_expression
from pg_policies
where schemaname = 'public'
  and tablename in ('games', 'match_requests', 'game_move_logs', 'profiles')
order by tablename, policyname;

-- =============================================================================
-- C) finish_game: existence, security, definition (catalog metadata)
-- =============================================================================
select
  p.proname,
  l.lanname as language,
  p.prosecdef as is_security_definer,
  pg_get_userbyid(p.proowner) as owner,
  p.provolatile,
  oidvectortypes(p.proargtypes) as arg_types
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
left join pg_language l on l.oid = p.prolang
where n.nspname = 'public'
  and p.proname = 'finish_game';

-- Full function source (if you have permission):
select pg_get_functiondef(p.oid) as finish_game_ddl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'finish_game';

-- =============================================================================
-- D) Grants on tables (public + authenticated role if used)
-- =============================================================================
select
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('games', 'match_requests', 'game_move_logs', 'profiles')
order by table_name, grantee, privilege_type;

-- =============================================================================
-- E) Realtime publication membership
-- =============================================================================
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('games', 'game_move_logs', 'match_requests')
order by tablename;

-- Also list all public tables in the publication (broader view):
-- select tablename from pg_publication_tables
-- where pubname = 'supabase_realtime' and schemaname = 'public'
-- order by tablename;

-- =============================================================================
-- CHECKLIST — “good” vs red flags (human review)
-- =============================================================================
--
-- Good signs:
--   • game_move_logs: RLS on; SELECT/INSERT policies match participant expectations.
--   • games: explicit policies restricting UPDATE/INSERT to seated players (or service role only).
--   • finish_game: SECURITY DEFINER with internal checks (auth.uid() is white/black, status active).
--   • Realtime: games + game_move_logs (+ match_requests) in publication if clients use postgres_changes.
--
-- Red flags:
--   • games or match_requests with RLS disabled and GRANT ALL TO anon/authenticated.
--   • finish_game missing or SECURITY INVOKER only without table policies.
--   • No policy on games UPDATE → any authenticated user might patch any row (confirm with D).
--
-- Confirmed from repo (not from this script):
--   • game_move_logs RLS policies exist in supabase/migrations/20260401120000_game_move_logs.sql
--   • games / match_requests policies are NOT in repo migrations
--   • finish_game DDL is NOT in repo
