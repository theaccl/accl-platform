-- Run in Supabase SQL Editor (or psql) to verify slot-scoped open-seat RLS is active.
-- 1) Only one overload of auth_free_play_blocks_new_open_seat should exist: (uuid, text, text, boolean)

select
  p.oid::regprocedure as function_signature,
  pg_get_function_identity_arguments(p.oid) as identity_args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'auth_free_play_blocks_new_open_seat'
order by 1;

-- Expect exactly one row: auth_free_play_blocks_new_open_seat(uuid, text, text, boolean)
-- If you also see auth_free_play_blocks_new_open_seat(uuid), the legacy overload is still present.

-- 2) INSERT policy WITH CHECK must reference the 4-arg call (search for four commas / four args after the name)

select pol.polname,
       pg_get_expr(pol.polwithcheck, pol.polrelid) as with_check_expression
from pg_policy pol
join pg_class c on c.oid = pol.polrelid
where c.relname = 'games'
  and pol.polname = 'games_authenticated_insert_free_open_seat';

-- Expect with_check to contain:
--   auth_free_play_blocks_new_open_seat((select auth.uid()), coalesce(tempo, ''), coalesce(live_time_control, ''), coalesce(rated, false))
-- and NOT a single-argument auth_free_play_blocks_new_open_seat((select auth.uid())).

-- 3) Smoke: slot keys for two different PLAT rows should differ (run as superuser; adjust UUIDs if needed)

select public.free_play_queue_slot_key('live', '60m', true) as rapid_60_rated,
       public.free_play_queue_slot_key('live', '5+5', true) as blitz_55_rated,
       public.free_play_queue_slot_key('daily', '1d', false) as daily_1d;
