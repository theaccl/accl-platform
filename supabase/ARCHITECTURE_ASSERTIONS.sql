-- ACCL architecture assertions (read-only verification queries).
-- Purpose: detect drift between documented invariants and deployed DB behavior.

-- 1) Fixed rating bucket namespace contract
-- Expected set:
--   free_live, free_daily, free_correspondence,
--   tournament_live, tournament_daily, tournament_correspondence
select
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_def
from pg_constraint
where conrelid = 'public.player_ratings'::regclass
  and contype = 'c'
  and conname ilike '%bucket%';

-- 2) Finished-game immutability support surface
-- Inspect games table policies for UPDATE gates that should prevent finished -> non-finished regressions.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'games'
order by policyname;

-- 3) Tournament-rating deferral surface
-- Ensure free-play immediate updater is not being used for tournament rows.
-- (Function bodies must be reviewed manually for authoritative guarantees.)
select
  p.proname,
  p.prosecdef as security_definer,
  pg_get_functiondef(p.oid) as function_ddl
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'classify_rating_bucket',
    'apply_free_play_rating_update',
    'apply_free_play_rating_update_core',
    'finish_game'
  )
order by p.proname;
