-- Run in Supabase SQL Editor after applying migrations.
-- (Apply full contents of 20260401120000_game_move_logs.sql,
--  20260402120000_realtime_games.sql, and 20260403120000_realtime_match_requests.sql
--  first if not already done.)

-- 1) Tables exist
select
  to_regclass('public.games') as games,
  to_regclass('public.game_move_logs') as game_move_logs,
  to_regclass('public.match_requests') as match_requests;

-- 2) Tables are in the Realtime publication (authoritative for postgres_changes)
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename in ('games', 'game_move_logs', 'match_requests')
order by tablename;

-- 3) Optional: dashboard also shows this under Database → Publications → supabase_realtime
--
-- Note: `select * from supabase_realtime.subscription` (or `realtime.subscription`)
-- reflects *active client subscriptions / replication slots*, not which tables are
-- listed in the publication. Use pg_publication_tables (above) to confirm `games`,
-- `game_move_logs`, and `match_requests` are enabled for broadcast.
