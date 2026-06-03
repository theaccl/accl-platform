-- Forward-only reconciliation for partially applied profile identity schema (20260518130000).
-- Production evidence: profiles.flag exists; last_active_at and cache columns missing;
-- touch_profile_activity() absent. Historical migrations remain frozen.
--
-- ACCL_PROFILE_IDENTITY_SCHEMA_PREREQUISITE_RECONCILIATION
-- Intentionally sorts before 20260621140000 (optional bio + public flag snapshot).
-- Rated Daily Phase A (20260622140000) is untouched.

begin;

alter table public.profiles
  add column if not exists flag text,
  add column if not exists last_active_at timestamptz,
  add column if not exists username_change_count int not null default 0,
  add column if not exists games_played int not null default 0,
  add column if not exists current_streak int not null default 0,
  add column if not exists highest_streak int not null default 0;

comment on column public.profiles.flag is
  'Optional public flag label (two-letter ISO code or OTHER after hardened RPC normalization).';

comment on column public.profiles.last_active_at is
  'Last observed authenticated client activity heartbeat for online presence.';

comment on column public.profiles.username_change_count is
  'Reserved for future username change limits.';

comment on column public.profiles.games_played is
  'Optional cached games count; prefer finished_games_count in snapshot when reconciling.';

comment on column public.profiles.current_streak is
  'Optional cached streak display field.';

comment on column public.profiles.highest_streak is
  'Optional cached best-streak display field.';

create or replace function public.touch_profile_activity()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();

  if v_uid is null then
    return;
  end if;

  update public.profiles
  set last_active_at = now()
  where id = v_uid;
end;
$$;

comment on function public.touch_profile_activity() is
  'Updates profiles.last_active_at for the authenticated user. No-op when no authenticated uid is present.';

revoke all on function public.touch_profile_activity() from public;
revoke all on function public.touch_profile_activity() from anon;
revoke all on function public.touch_profile_activity() from service_role;
grant execute on function public.touch_profile_activity() to authenticated;

commit;
