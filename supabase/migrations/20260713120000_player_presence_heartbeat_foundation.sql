-- Phase 1: dormant presence heartbeat foundation (per-tab recording only).
-- No cleanup, logout sweep, open-seat withdrawal, cron, or public presence derivation.

begin;

create table if not exists public.player_presence_tabs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  auth_session_id uuid not null,
  tab_presence_id uuid not null,
  last_heartbeat_at timestamptz not null default now(),
  last_interaction_at timestamptz null,
  visibility_state text not null,
  ended_at timestamptz null,
  end_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint player_presence_tabs_visibility_state_check check (
    visibility_state in ('visible', 'hidden')
  ),
  constraint player_presence_tabs_end_reason_check check (
    end_reason is null
    or end_reason in ('tab_closed', 'session_expired', 'logout', 'stale_sweep', 'admin')
  ),
  constraint player_presence_tabs_user_session_tab_uq unique (
    user_id,
    auth_session_id,
    tab_presence_id
  )
);

comment on table public.player_presence_tabs is
  'Per-browser-tab presence heartbeat rows (Phase 1). Private; writes via upsert_player_presence_heartbeat only.';

create index if not exists player_presence_tabs_user_id_open_idx
  on public.player_presence_tabs (user_id)
  where ended_at is null;

create index if not exists player_presence_tabs_stale_open_idx
  on public.player_presence_tabs (last_heartbeat_at)
  where ended_at is null;

create index if not exists player_presence_tabs_session_tab_idx
  on public.player_presence_tabs (auth_session_id, tab_presence_id);

alter table public.player_presence_tabs enable row level security;

revoke all on table public.player_presence_tabs from public;
revoke all on table public.player_presence_tabs from anon;
revoke all on table public.player_presence_tabs from authenticated;

create or replace function public.upsert_player_presence_heartbeat(
  p_tab_presence_id uuid,
  p_visibility_state text,
  p_interaction boolean
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_uid uuid;
  v_session_id uuid;
  v_now timestamptz := now();
  v_row public.player_presence_tabs%rowtype;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'authentication_required';
  end if;

  begin
    v_session_id := nullif(btrim(coalesce(auth.jwt() ->> 'session_id', '')), '')::uuid;
  exception
    when others then
      v_session_id := null;
  end;

  if v_session_id is null then
    raise exception 'session_id_required';
  end if;

  if p_tab_presence_id is null then
    raise exception 'tab_presence_id_required';
  end if;

  if p_visibility_state is null or p_visibility_state not in ('visible', 'hidden') then
    raise exception 'invalid_visibility_state';
  end if;

  if p_interaction is null then
    raise exception 'invalid_interaction';
  end if;

  insert into public.player_presence_tabs (
    user_id,
    auth_session_id,
    tab_presence_id,
    last_heartbeat_at,
    last_interaction_at,
    visibility_state,
    ended_at,
    end_reason,
    created_at,
    updated_at
  )
  values (
    v_uid,
    v_session_id,
    p_tab_presence_id,
    v_now,
    case when p_interaction then v_now else null end,
    p_visibility_state,
    null,
    null,
    v_now,
    v_now
  )
  on conflict on constraint player_presence_tabs_user_session_tab_uq
  do update set
    last_heartbeat_at = v_now,
    last_interaction_at = case
      when p_interaction then v_now
      else public.player_presence_tabs.last_interaction_at
    end,
    visibility_state = excluded.visibility_state,
    ended_at = null,
    end_reason = null,
    updated_at = v_now
  returning * into v_row;

  if p_interaction then
    update public.profiles
    set last_active_at = v_now
    where id = v_uid;
  else
    update public.profiles
    set last_active_at = v_now
    where id = v_uid
      and (
        last_active_at is null
        or last_active_at < v_now - interval '2 minutes'
      );
  end if;

  return v_now;
end;
$$;

comment on function public.upsert_player_presence_heartbeat(uuid, text, boolean) is
  'Authenticated per-tab presence heartbeat. Identity from auth.uid() and JWT session_id only.';

revoke all on function public.upsert_player_presence_heartbeat(uuid, text, boolean) from public;
revoke all on function public.upsert_player_presence_heartbeat(uuid, text, boolean) from anon;
revoke all on function public.upsert_player_presence_heartbeat(uuid, text, boolean) from service_role;
grant execute on function public.upsert_player_presence_heartbeat(uuid, text, boolean) to authenticated;

commit;
