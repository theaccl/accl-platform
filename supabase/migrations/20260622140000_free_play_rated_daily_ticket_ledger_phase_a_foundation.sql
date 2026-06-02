-- Phase A: Rated Daily ticket ledger foundation (schema + read-only usage snapshot).
-- Additive only: does NOT alter 20260620140000 daily authority, write paths, sweeps, or payment wiring.
-- ACCL_PAID_UNLOCK_CHECKOUT_REQUIRED — entitlement rows only; no payment wiring here.

begin;

-- ---------------------------------------------------------------------------
-- 1) Entitlements (rated_play_unlock, tournament_unlock future keys)
-- ---------------------------------------------------------------------------

create table if not exists public.user_entitlements (
  user_id uuid not null references auth.users (id) on delete cascade,
  entitlement_key text not null,
  granted_at timestamptz not null default now(),
  source text,
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint user_entitlements_pkey primary key (user_id, entitlement_key),
  constraint user_entitlements_key_check check (
    entitlement_key in ('rated_play_unlock', 'tournament_unlock')
  )
);

comment on table public.user_entitlements is
  'Product entitlements (one-time unlocks). Payment wiring is a separate slice.';

create index if not exists user_entitlements_active_key_idx
  on public.user_entitlements (entitlement_key)
  where revoked_at is null;

alter table public.user_entitlements enable row level security;

revoke all on table public.user_entitlements from public;
revoke all on table public.user_entitlements from anon;

grant select on table public.user_entitlements to authenticated;
grant all on table public.user_entitlements to service_role;

drop policy if exists user_entitlements_select_own on public.user_entitlements;
create policy user_entitlements_select_own
  on public.user_entitlements
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists user_entitlements_service_role_all on public.user_entitlements;
create policy user_entitlements_service_role_all
  on public.user_entitlements
  for all
  to service_role
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- 2) Rated Daily public queue metadata (canonical games row)
-- ---------------------------------------------------------------------------

create table if not exists public.free_play_rated_daily_queue_meta (
  game_id uuid primary key references public.games (id) on delete cascade,
  host_user_id uuid not null,
  origin_utc_day date not null,
  expires_at timestamptz not null,
  close_reason_detail text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint free_play_rated_daily_queue_meta_expires_after_origin check (
    expires_at >= (origin_utc_day::timestamp at time zone 'UTC')
  )
);

comment on table public.free_play_rated_daily_queue_meta is
  'Rated Daily public queue shelf metadata. Today vs carryover derived from origin_utc_day only.';

comment on column public.free_play_rated_daily_queue_meta.expires_at is
  'Shelf expiry: 00:00 UTC at start of origin_utc_day + 2.';

create index if not exists free_play_rated_daily_queue_meta_host_day_idx
  on public.free_play_rated_daily_queue_meta (host_user_id, origin_utc_day);

create index if not exists free_play_rated_daily_queue_meta_expires_open_idx
  on public.free_play_rated_daily_queue_meta (expires_at)
  where closed_at is null;

create index if not exists free_play_rated_daily_queue_meta_carryover_read_idx
  on public.free_play_rated_daily_queue_meta (host_user_id, origin_utc_day, expires_at)
  where closed_at is null;

alter table public.free_play_rated_daily_queue_meta enable row level security;

revoke all on table public.free_play_rated_daily_queue_meta from public;
revoke all on table public.free_play_rated_daily_queue_meta from anon;

grant select on table public.free_play_rated_daily_queue_meta to authenticated;
grant all on table public.free_play_rated_daily_queue_meta to service_role;

drop policy if exists free_play_rated_daily_queue_meta_select_own on public.free_play_rated_daily_queue_meta;
create policy free_play_rated_daily_queue_meta_select_own
  on public.free_play_rated_daily_queue_meta
  for select
  to authenticated
  using (host_user_id = auth.uid());

drop policy if exists free_play_rated_daily_queue_meta_service_role_all on public.free_play_rated_daily_queue_meta;
create policy free_play_rated_daily_queue_meta_service_role_all
  on public.free_play_rated_daily_queue_meta
  for all
  to service_role
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- 3) Free-account current-day position ledger (auditable ticket positions)
-- ---------------------------------------------------------------------------

create table if not exists public.free_play_rated_daily_position_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  utc_day date not null,
  position_no smallint not null,
  state text not null,
  source_kind text not null,
  source_game_id uuid references public.games (id) on delete set null,
  source_match_request_id uuid references public.match_requests (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  committed_at timestamptz,
  released_at timestamptz,
  constraint free_play_rated_daily_position_ledger_position_no_check check (
    position_no between 1 and 5
  ),
  constraint free_play_rated_daily_position_ledger_state_check check (
    state in ('waiting', 'committed', 'released')
  ),
  constraint free_play_rated_daily_position_ledger_source_kind_check check (
    source_kind in ('public_post', 'public_accept', 'direct_challenge_accept')
  )
);

comment on table public.free_play_rated_daily_position_ledger is
  'Free-account UTC-day Rated Daily ticket positions (1–5). Paid unlimited acceptance does not use committed slots here.';

create unique index if not exists free_play_rated_daily_position_ledger_active_slot_uidx
  on public.free_play_rated_daily_position_ledger (user_id, utc_day, position_no)
  where state in ('waiting', 'committed');

create index if not exists free_play_rated_daily_position_ledger_user_day_idx
  on public.free_play_rated_daily_position_ledger (user_id, utc_day, state);

alter table public.free_play_rated_daily_position_ledger enable row level security;

revoke all on table public.free_play_rated_daily_position_ledger from public;
revoke all on table public.free_play_rated_daily_position_ledger from anon;

grant select on table public.free_play_rated_daily_position_ledger to authenticated;
grant all on table public.free_play_rated_daily_position_ledger to service_role;

drop policy if exists free_play_rated_daily_position_ledger_select_own on public.free_play_rated_daily_position_ledger;
create policy free_play_rated_daily_position_ledger_select_own
  on public.free_play_rated_daily_position_ledger
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists free_play_rated_daily_position_ledger_service_role_all on public.free_play_rated_daily_position_ledger;
create policy free_play_rated_daily_position_ledger_service_role_all
  on public.free_play_rated_daily_position_ledger
  for all
  to service_role
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- 4) Rated Daily direct-challenge metadata (Phase C authority foundation)
-- ---------------------------------------------------------------------------

create table if not exists public.free_play_rated_daily_challenge_meta (
  match_request_id uuid primary key references public.match_requests (id) on delete cascade,
  challenger_user_id uuid not null,
  origin_utc_day date not null,
  expires_at timestamptz not null,
  closed_at timestamptz,
  close_reason_detail text,
  created_at timestamptz not null default now(),
  constraint free_play_rated_daily_challenge_meta_expires_after_origin check (
    expires_at >= (origin_utc_day::timestamp at time zone 'UTC')
  )
);

comment on table public.free_play_rated_daily_challenge_meta is
  'Rated Daily direct-challenge shelf metadata (D+2). Send/accept authority remains future Phase C.';

create index if not exists free_play_rated_daily_challenge_meta_challenger_idx
  on public.free_play_rated_daily_challenge_meta (challenger_user_id, expires_at)
  where closed_at is null;

alter table public.free_play_rated_daily_challenge_meta enable row level security;

revoke all on table public.free_play_rated_daily_challenge_meta from public;
revoke all on table public.free_play_rated_daily_challenge_meta from anon;

grant select on table public.free_play_rated_daily_challenge_meta to authenticated;
grant all on table public.free_play_rated_daily_challenge_meta to service_role;

drop policy if exists free_play_rated_daily_challenge_meta_select_own on public.free_play_rated_daily_challenge_meta;
create policy free_play_rated_daily_challenge_meta_select_own
  on public.free_play_rated_daily_challenge_meta
  for select
  to authenticated
  using (challenger_user_id = auth.uid());

drop policy if exists free_play_rated_daily_challenge_meta_service_role_all on public.free_play_rated_daily_challenge_meta;
create policy free_play_rated_daily_challenge_meta_service_role_all
  on public.free_play_rated_daily_challenge_meta
  for all
  to service_role
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- 5) Helpers
-- ---------------------------------------------------------------------------

create or replace function public.free_play_rated_daily_shelf_expires_at(p_origin_utc_day date)
returns timestamptz
language sql
immutable
parallel safe
as $$
  select ((p_origin_utc_day + 2)::timestamp at time zone 'UTC');
$$;

comment on function public.free_play_rated_daily_shelf_expires_at(date) is
  'Rated Daily shelf expiry: 00:00 UTC at start of origin_utc_day + 2.';

revoke all on function public.free_play_rated_daily_shelf_expires_at(date) from public;
revoke all on function public.free_play_rated_daily_shelf_expires_at(date) from anon, authenticated;
grant execute on function public.free_play_rated_daily_shelf_expires_at(date) to service_role;

-- ---------------------------------------------------------------------------
-- 6) Read-only usage snapshot RPC
-- SECURITY DEFINER: aggregates games/match_requests with tournament exclusion;
-- caller may only read own snapshot (auth.uid() = p_user_id) unless service_role.
-- ---------------------------------------------------------------------------

create or replace function public.free_play_read_rated_daily_usage_strip(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_uid uuid := p_user_id;
  v_caller uuid := auth.uid();
  v_utc_day date := (timezone('UTC', now()))::date;
  v_reset_at timestamptz := ((v_utc_day + 1)::timestamp at time zone 'UTC');
  v_carryover_expires_at timestamptz := ((v_utc_day + 1)::timestamp at time zone 'UTC');
  v_yesterday date := v_utc_day - 1;
  v_has_unlock boolean := false;
  v_today_waiting integer := 0;
  v_carryover_waiting integer := 0;
  v_today_committed integer := 0;
  v_today_available integer := 0;
  v_ongoing_seated integer := 0;
  v_pending_challenges integer := 0;
  v_pending_cap integer := 5;
  v_legacy_unclassified integer := 0;
  v_classified integer := 0;
  v_total_obligations integer := 0;
  v_today_queue_allowance integer := 10;
  v_today_queue_available integer := 0;
  v_positions jsonb := '[]'::jsonb;
  v_queue_slots jsonb := '[]'::jsonb;
  v_i integer;
  v_state text;
  v_ledger_committed integer := 0;
  v_ledger_waiting integer := 0;
begin
  if v_uid is null then
    return null;
  end if;

  if v_caller is distinct from v_uid
     and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'forbidden'
      using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.user_entitlements e
    where e.user_id = v_uid
      and e.entitlement_key = 'rated_play_unlock'
      and e.revoked_at is null
  )
  into v_has_unlock;

  if v_has_unlock then
    v_pending_cap := 10;
  end if;

  -- Today / carryover waiting public queue rows (metadata + live open seat)
  select count(*)::integer
  into v_today_waiting
  from public.free_play_rated_daily_queue_meta m
  join public.games g on g.id = m.game_id
  where m.host_user_id = v_uid
    and m.origin_utc_day = v_utc_day
    and m.closed_at is null
    and m.expires_at > now()
    and g.tournament_id is null
    and lower(btrim(coalesce(g.play_context, ''))) = 'free'
    and lower(btrim(coalesce(g.tempo, ''))) = 'daily'
    and coalesce(g.rated, false) = true
    and lower(btrim(coalesce(g.status, ''))) in ('active', 'waiting')
    and g.black_player_id is null;

  select count(*)::integer
  into v_carryover_waiting
  from public.free_play_rated_daily_queue_meta m
  join public.games g on g.id = m.game_id
  where m.host_user_id = v_uid
    and m.origin_utc_day = v_yesterday
    and m.closed_at is null
    and m.expires_at > now()
    and g.tournament_id is null
    and lower(btrim(coalesce(g.play_context, ''))) = 'free'
    and lower(btrim(coalesce(g.tempo, ''))) = 'daily'
    and coalesce(g.rated, false) = true
    and lower(btrim(coalesce(g.status, ''))) in ('active', 'waiting')
    and g.black_player_id is null;

  select count(*)::integer
  into v_ledger_committed
  from public.free_play_rated_daily_position_ledger l
  where l.user_id = v_uid
    and l.utc_day = v_utc_day
    and l.state = 'committed';

  select count(*)::integer
  into v_ledger_waiting
  from public.free_play_rated_daily_position_ledger l
  where l.user_id = v_uid
    and l.utc_day = v_utc_day
    and l.state = 'waiting';

  if not v_has_unlock then
    v_today_committed := v_ledger_committed;
    if v_ledger_waiting > 0 or v_ledger_committed > 0 then
      v_today_waiting := v_ledger_waiting;
    end if;
    v_today_available := greatest(0, 5 - v_today_waiting - v_today_committed);

    if v_ledger_waiting > 0 or v_ledger_committed > 0 then
      for v_i in 1..5 loop
        v_state := null;

        select l.state
        into v_state
        from public.free_play_rated_daily_position_ledger l
        where l.user_id = v_uid
          and l.utc_day = v_utc_day
          and l.position_no = v_i
          and l.state in ('waiting', 'committed')
        limit 1;

        v_state := coalesce(v_state, 'empty');

        v_positions := v_positions || jsonb_build_array(
          jsonb_build_object('position_no', v_i, 'state', v_state)
        );
      end loop;
    else
      for v_i in 1..5 loop
        v_state := case
          when v_i <= v_today_waiting then 'waiting'
          else 'empty'
        end;

        v_positions := v_positions || jsonb_build_array(
          jsonb_build_object('position_no', v_i, 'state', v_state)
        );
      end loop;
    end if;
  else
    v_today_queue_available := greatest(0, v_today_queue_allowance - v_today_waiting);
    for v_i in 1..v_today_queue_allowance loop
      v_queue_slots := v_queue_slots || jsonb_build_array(
        jsonb_build_object(
          'slot_no', v_i,
          'state', case when v_i <= v_today_waiting then 'waiting' else 'empty' end
        )
      );
    end loop;
  end if;

  select count(*)::integer
  into v_ongoing_seated
  from public.games g
  where g.tournament_id is null
    and lower(btrim(coalesce(g.play_context, ''))) = 'free'
    and lower(btrim(coalesce(g.tempo, ''))) = 'daily'
    and coalesce(g.rated, false) = true
    and lower(btrim(coalesce(g.status, ''))) in ('active', 'waiting')
    and g.black_player_id is not null
    and v_uid in (g.white_player_id, g.black_player_id);

  select count(*)::integer
  into v_pending_challenges
  from public.match_requests mr
  where mr.from_user_id = v_uid
    and lower(btrim(coalesce(mr.status, ''))) = 'pending'
    and lower(btrim(coalesce(mr.tempo, ''))) = 'daily'
    and coalesce(mr.rated, false) = true
    and lower(btrim(coalesce(mr.request_type, ''))) = 'challenge'
    and coalesce(mr.visibility, 'direct') <> 'open';

  select count(*)::integer
  into v_total_obligations
  from public.games g
  where g.tournament_id is null
    and lower(btrim(coalesce(g.play_context, ''))) = 'free'
    and lower(btrim(coalesce(g.tempo, ''))) = 'daily'
    and coalesce(g.rated, false) = true
    and lower(btrim(coalesce(g.status, ''))) in ('active', 'waiting')
    and v_uid in (g.white_player_id, g.black_player_id);

  select count(distinct g.id)::integer
  into v_classified
  from public.games g
  where g.id in (
    select m.game_id from public.free_play_rated_daily_queue_meta m where m.host_user_id = v_uid
    union
    select l.source_game_id from public.free_play_rated_daily_position_ledger l
    where l.user_id = v_uid and l.source_game_id is not null
  )
    and g.tournament_id is null
    and lower(btrim(coalesce(g.play_context, ''))) = 'free'
    and lower(btrim(coalesce(g.tempo, ''))) = 'daily'
    and coalesce(g.rated, false) = true
    and lower(btrim(coalesce(g.status, ''))) in ('active', 'waiting')
    and v_uid in (g.white_player_id, g.black_player_id);

  v_legacy_unclassified := greatest(0, v_total_obligations - v_classified);

  if v_has_unlock then
    return jsonb_build_object(
      'utc_day', v_utc_day,
      'reset_at', v_reset_at,
      'entitlement_rated_play_unlock', true,
      'today_queue_allowance', v_today_queue_allowance,
      'today_waiting_count', v_today_waiting,
      'today_queue_available_count', v_today_queue_available,
      'today_queue_slots', v_queue_slots,
      'carryover_waiting_count', v_carryover_waiting,
      'carryover_expires_at', v_carryover_expires_at,
      'ongoing_seated_rated_daily_count', v_ongoing_seated,
      'pending_sent_rated_daily_challenge_count', v_pending_challenges,
      'pending_sent_rated_daily_challenge_cap', v_pending_cap,
      'acceptance_unlimited', true,
      'legacy_unclassified_rated_daily_count', v_legacy_unclassified
    );
  end if;

  return jsonb_build_object(
    'utc_day', v_utc_day,
    'reset_at', v_reset_at,
    'entitlement_rated_play_unlock', false,
    'today_allowance', 5,
    'today_waiting_count', v_today_waiting,
    'today_committed_count', v_today_committed,
    'today_available_count', v_today_available,
    'today_positions', v_positions,
    'carryover_waiting_count', v_carryover_waiting,
    'carryover_expires_at', v_carryover_expires_at,
    'ongoing_seated_rated_daily_count', v_ongoing_seated,
    'pending_sent_rated_daily_challenge_count', v_pending_challenges,
    'pending_sent_rated_daily_challenge_cap', v_pending_cap,
    'legacy_unclassified_rated_daily_count', v_legacy_unclassified
  );
end;
$$;

comment on function public.free_play_read_rated_daily_usage_strip(uuid) is
  'Phase A read model for Rated Daily usage strip. No write authority. Tournament rows excluded via tournament_id IS NULL.';

revoke all on function public.free_play_read_rated_daily_usage_strip(uuid) from public;
grant execute on function public.free_play_read_rated_daily_usage_strip(uuid) to authenticated;
grant execute on function public.free_play_read_rated_daily_usage_strip(uuid) to service_role;

-- ACCL_RATED_TICKET_PUNCH_VISUAL_UPGRADE_REQUIRED
-- ACCL_PAID_UNLOCK_CHECKOUT_REQUIRED

commit;
