-- Diagnostic: recent free-play queue supersede/cancel activity.
-- Purpose: verify which open-seat rows were finished as superseded and whether
-- any daily/correspondence paced rows were unexpectedly treated as live.
--
-- Usage (psql):
--   \i supabase/scripts/diagnose_free_queue_supersede_recent.sql
--
-- Optional session override before running:
--   set app.diag_lookback_hours = '48';

-- Lookback window in hours (default 24 unless overridden in session).
with cfg as (
  select coalesce(nullif(current_setting('app.diag_lookback_hours', true), '')::int, 24) as lookback_h
),
window as (
  select now() - make_interval(hours => lookback_h) as ts_from
  from cfg
),
recent_superseded_open_seats as (
  select
    g.id,
    g.created_at,
    g.updated_at,
    g.status,
    g.end_reason,
    g.tempo,
    g.live_time_control,
    g.white_player_id,
    g.black_player_id,
    g.play_context,
    g.tournament_id,
    case
      when lower(btrim(coalesce(g.tempo, ''))) in ('daily', 'correspondence') then 'async_daily_or_corr'
      when lower(btrim(coalesce(g.tempo, ''))) = 'live' then 'live'
      when coalesce(g.tempo, '') = '' then 'missing_tempo'
      else 'other_tempo'
    end as tempo_bucket
  from public.games g
  where g.play_context = 'free'
    and g.tournament_id is null
    and g.black_player_id is null
    and g.end_reason = 'superseded'
    and g.updated_at >= (select ts_from from window)
),
recent_match_requests as (
  select
    mr.id,
    mr.created_at,
    mr.responded_at,
    mr.status,
    mr.visibility,
    mr.tempo,
    mr.live_time_control,
    mr.from_user_id,
    mr.to_user_id
  from public.match_requests mr
  where coalesce(mr.status, '') in ('cancelled', 'accepted')
    and (
      coalesce(mr.responded_at, mr.created_at) >= (select ts_from from window)
      or mr.created_at >= (select ts_from from window)
    )
)

-- 1) Detailed superseded free open seats (primary evidence)
select
  'superseded_open_seat'::text as section,
  s.id,
  s.created_at,
  s.updated_at,
  s.status,
  s.end_reason,
  s.tempo,
  s.live_time_control,
  s.white_player_id,
  s.black_player_id,
  s.play_context,
  s.tournament_id,
  s.tempo_bucket
from recent_superseded_open_seats s
order by s.updated_at desc nulls last, s.created_at desc;

-- 2) Quick bucket summary: are any async rows being superseded?
select
  'superseded_summary'::text as section,
  s.tempo_bucket,
  count(*) as rows
from recent_superseded_open_seats s
group by s.tempo_bucket
order by rows desc;

-- 3) Recent match_requests cancelled/accepted in same window (timeline context)
select
  'match_requests_recent'::text as section,
  mr.id,
  mr.created_at,
  mr.responded_at,
  mr.status,
  mr.visibility,
  mr.tempo,
  mr.live_time_control,
  mr.from_user_id,
  mr.to_user_id
from recent_match_requests mr
order by coalesce(mr.responded_at, mr.created_at) desc, mr.created_at desc;

