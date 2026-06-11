-- ACCL Stage 1 — production rating baseline reconciliation (BR1).
-- ACCL_RATING_BASELINE_RECONCILIATION_FROZEN
--
-- Converges Path A (partial production schema) and Path B (full repo chain @ 1b8b6ec)
-- to one canonical dormant baseline without activating Stage 3 badge settlement.
--
-- In scope:
--   - drop orphan games_apply_rating trigger
--   - dormant badge schema foundation (tables, RLS, seed bands only)
--   - read-only badge classifier helpers
--   - authoritative dormant apply_free_play_badge_settlement + settle_player_badge_state shims
--   - owner-only EXECUTE on mutation-capable badge functions (no client RPC)
--   - ledger index parity assertions
--
-- Out of scope (explicit):
--   - accl_overall, snapshot alias switch, 4000 uncap, rating backfill
--   - rating core replacement, classifier replacement (parity verified BR0F)
--   - schema_migrations repair, Stage 3 badge activation

-- =============================================================================
-- Section A — precondition comments and safe assertions
-- =============================================================================

-- Operator expectations before apply:
--   same-event duplicate ledger rows     → 0
--   cross-event duplicate ledger rows    → 0
--   games_apply_free_rating_after_finish → present
--   apply_free_play_rating_update_core   → contains v2_elo_free
--   get_public_profile_snapshot          → accl_rating aliases tournament_unified
--   accl_overall                         → absent
-- BR1 does not mutate historical ledger rows.

do $br1_pre$
declare
  v_same_event bigint;
  v_cross_event bigint;
  v_core_def text;
  v_snapshot_def text;
  v_accl_overall bigint;
begin
  if to_regclass('public.player_rating_history_ledger') is not null then
    select count(*) into v_same_event
    from (
      select player_id, rating_track_id, game_id, event_type
      from public.player_rating_history_ledger
      where game_id is not null
      group by 1, 2, 3, 4
      having count(*) > 1
    ) dup;

    if v_same_event > 0 then
      raise exception
        'BR1 precondition failed: % same-event duplicate ledger groups (expected 0)',
        v_same_event;
    end if;

    select count(*) into v_cross_event
    from (
      select player_id, rating_track_id, game_id
      from public.player_rating_history_ledger
      where game_id is not null
      group by 1, 2, 3
      having count(distinct event_type) > 1
    ) cross_dup;

    if v_cross_event > 0 then
      raise exception
        'BR1 precondition failed: % cross-event duplicate ledger groups (expected 0)',
        v_cross_event;
    end if;
  end if;

  if not exists (
    select 1
    from pg_trigger t
    join pg_class r on r.oid = t.tgrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname = 'games'
      and t.tgname = 'games_apply_free_rating_after_finish'
      and not t.tgisinternal
  ) then
    raise exception
      'BR1 precondition failed: canonical games_apply_free_rating_after_finish trigger missing';
  end if;

  if to_regprocedure('public.apply_free_play_rating_update_core(uuid)') is null then
    raise exception
      'BR1 precondition failed: apply_free_play_rating_update_core(uuid) missing';
  end if;

  select pg_get_functiondef('public.apply_free_play_rating_update_core(uuid)'::regprocedure)
  into v_core_def;

  if position('v2_elo_free' in lower(v_core_def)) = 0 then
    raise exception
      'BR1 precondition failed: apply_free_play_rating_update_core missing v2_elo_free marker';
  end if;

  if to_regprocedure('public.get_public_profile_snapshot(uuid)') is not null then
    select pg_get_functiondef('public.get_public_profile_snapshot(uuid)'::regprocedure)
    into v_snapshot_def;

    if position('''accl_rating'', v_tu' in lower(v_snapshot_def)) = 0
       and position('accl_rating' in lower(v_snapshot_def)) > 0
       and position('tournament_unified' in lower(v_snapshot_def)) = 0 then
      raise warning
        'BR1 notice: get_public_profile_snapshot may not alias accl_rating to tournament_unified; verify before production apply';
    end if;
  end if;

  if to_regclass('public.player_ratings') is not null then
    select count(*) into v_accl_overall
    from public.player_ratings
    where bucket = 'accl_overall';

    if v_accl_overall > 0 then
      raise exception
        'BR1 precondition failed: accl_overall rows present (%) — F1 not authorized',
        v_accl_overall;
    end if;
  end if;
end;
$br1_pre$;

-- =============================================================================
-- Section B — orphan trigger removal (production Path A only)
-- =============================================================================

drop trigger if exists games_apply_rating on public.games;

do $orphan_fn$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'trg_games_apply_rating'
  loop
    execute format(
      'comment on function %s is %L',
      fn,
      'Orphan pre-repo trigger body; games_apply_rating trigger dropped by BR1; retained for audit only. Do not reattach.'
    );
  end loop;
end;
$orphan_fn$;

-- =============================================================================
-- Section C — canonical trigger preservation (no body replacement)
-- =============================================================================

comment on function public.trg_games_apply_free_rating_after_finish() is
  'After games.status transitions to finished: apply_free_play_rating_update_core + Vault winner emitter (safe, idempotent, audited). Preserved by BR1; do not replace.';

-- =============================================================================
-- Section D — dormant badge schema foundation (Path A create; Path B idempotent)
-- Source: 20260619120000_free_play_badge_settlement_foundation.sql (schema only)
-- Hard rule: BR1 must not insert player_badge_state rows.
-- =============================================================================

create table if not exists public.accl_badge_rank_bands (
  band_slug text primary key,
  display_name text not null,
  lower_border int null,
  sort_order int not null
);

insert into public.accl_badge_rank_bands (band_slug, display_name, lower_border, sort_order)
values
  ('elite', 'Elite', 2400, 8),
  ('master', 'Master', 2200, 7),
  ('expert', 'Expert', 2000, 6),
  ('a', 'A', 1800, 5),
  ('b', 'B', 1600, 4),
  ('c', 'C', 1400, 3),
  ('d', 'D', 1200, 2),
  ('e', 'E', 1000, 1),
  ('f', 'F', null, 0)
on conflict (band_slug) do nothing;

comment on table public.accl_badge_rank_bands is
  'ACCL badge rank bands for free-play tracks; danger = lower_border - 25 when border present.';

create table if not exists public.player_badge_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  track_key text not null,
  settlement_rating int not null default 1500,
  active_rank_band text not null,
  visual_state text not null default 'normal',
  pressure_state text not null default 'stable',
  pressure_border int null,
  win_streak int not null default 0,
  peak_rank_band text null,
  last_game_id uuid null references public.games (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, track_key),
  constraint player_badge_state_visual_check check (
    visual_state in ('normal', 'upgraded', 'downgraded')
  ),
  constraint player_badge_state_pressure_check check (
    pressure_state in ('stable', 'promotion_armed', 'demotion_armed')
  ),
  constraint player_badge_state_rating_range check (
    settlement_rating between 100 and 4000
  )
);

create index if not exists player_badge_state_user_idx
  on public.player_badge_state (user_id, updated_at desc);

comment on table public.player_badge_state is
  'Backend-owned free-play badge truth per exact time-control track; Stage 3 settlement disabled until authorized.';

comment on column public.player_badge_state.settlement_rating is
  'Canonical per-track rating for badge math (independent of P1 mode buckets and tournament_unified).';

alter table public.player_badge_state enable row level security;

drop policy if exists "player_badge_state_select_own" on public.player_badge_state;
create policy "player_badge_state_select_own"
  on public.player_badge_state for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.player_badge_state from anon;
revoke all on table public.player_badge_state from authenticated;
revoke all on table public.player_badge_state from service_role;
grant select on table public.player_badge_state to authenticated;

-- No INSERT / UPDATE / DELETE policies. Stage 3 authorization required before writes.

-- =============================================================================
-- Section E — read-only badge helpers (classifiers; no mutation paths)
-- =============================================================================

create or replace function public.classify_free_badge_track_key(
  p_tempo text,
  p_live_time_control text
)
returns text
language plpgsql
immutable
as $$
declare
  v_t text;
  v_lc text;
begin
  v_t := lower(trim(coalesce(p_tempo, '')));
  v_lc := lower(trim(coalesce(p_live_time_control, '')));
  v_lc := regexp_replace(v_lc, '\s+', '', 'g');
  if v_lc = '' then
    return null;
  end if;

  if v_t in ('correspondence', 'daily') or v_lc ~ 'd$' then
    return case v_lc
      when '1d' then 'daily_1_day'
      when '2d' then 'daily_2_day'
      when '3d' then 'daily_3_day'
      when '5d' then 'daily_5_day'
      when '7d' then 'daily_7_day'
      else null
    end;
  end if;

  if v_t not in ('', 'live') then
    return null;
  end if;

  return case v_lc
    when '1m' then 'bullet_1_0'
    when '1+1' then 'bullet_1_1'
    when '2m' then 'bullet_2_0'
    when '2+0' then 'bullet_2_0'
    when '2+1' then 'bullet_2_1'
    when '3m' then 'blitz_3_0'
    when '3+2' then 'blitz_3_2'
    when '5m' then 'blitz_5_0'
    when '5+5' then 'blitz_5_5'
    when '10m' then 'rapid_10_0'
    when '15m' then 'rapid_15_0'
    when '20m' then 'rapid_20_0'
    when '30m' then 'rapid_30_0'
    when '60m' then 'rapid_60_0'
    else null
  end;
end;
$$;

create or replace function public.badge_rank_band_from_rating(p_rating int)
returns text
language sql
immutable
as $$
  select case
    when p_rating >= 2400 then 'elite'
    when p_rating >= 2200 then 'master'
    when p_rating >= 2000 then 'expert'
    when p_rating >= 1800 then 'a'
    when p_rating >= 1600 then 'b'
    when p_rating >= 1400 then 'c'
    when p_rating >= 1200 then 'd'
    when p_rating >= 1000 then 'e'
    else 'f'
  end;
$$;

create or replace function public.badge_lower_border_for_band(p_band text)
returns int
language sql
immutable
as $$
  select case p_band
    when 'elite' then 2400
    when 'master' then 2200
    when 'expert' then 2000
    when 'a' then 1800
    when 'b' then 1600
    when 'c' then 1400
    when 'd' then 1200
    when 'e' then 1000
    else null
  end;
$$;

create or replace function public.badge_band_sort_order(p_band text)
returns int
language sql
immutable
as $$
  select case p_band
    when 'f' then 0
    when 'e' then 1
    when 'd' then 2
    when 'c' then 3
    when 'b' then 4
    when 'a' then 5
    when 'expert' then 6
    when 'master' then 7
    when 'elite' then 8
    else 0
  end;
$$;

-- =============================================================================
-- Section F — authoritative dormant mutation shims (Path A + Path B overwrite)
-- Owner-only EXECUTE: apply_free_play_rating_update_core (SECURITY DEFINER) may
-- call apply_free_play_badge_settlement internally; direct client RPC is blocked.
-- =============================================================================

create or replace function public.settle_player_badge_state(
  p_user_id uuid,
  p_track_key text,
  p_rating_before int,
  p_rating_after int,
  p_delta int,
  p_game_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return jsonb_build_object(
    'applied', false,
    'reason', 'stage3_badge_state_mutation_disabled'
  );
end;
$$;

comment on function public.settle_player_badge_state(uuid, text, int, int, int, uuid) is
  'ACCL_STAGE3_BADGE_STATE_MUTATION_DISABLED. Schema-only parity; writes no player_badge_state. Replaced by Stage 3 migration when authorized.';

revoke all on function public.settle_player_badge_state(uuid, text, int, int, int, uuid) from public;
revoke execute on function public.settle_player_badge_state(uuid, text, int, int, int, uuid) from anon;
revoke execute on function public.settle_player_badge_state(uuid, text, int, int, int, uuid) from authenticated;
revoke execute on function public.settle_player_badge_state(uuid, text, int, int, int, uuid) from service_role;

create or replace function public.apply_free_play_badge_settlement(
  p_game_id uuid,
  p_rating_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return jsonb_build_object(
    'applied', false,
    'reason', 'stage3_badge_settlement_disabled'
  );
end;
$$;

comment on function public.apply_free_play_badge_settlement(uuid, jsonb) is
  'ACCL_STAGE3_BADGE_SETTLEMENT_DISABLED. Schema-only parity; writes no player_badge_state. Replaced by Stage 3 migration when authorized.';

revoke all on function public.apply_free_play_badge_settlement(uuid, jsonb) from public;
revoke execute on function public.apply_free_play_badge_settlement(uuid, jsonb) from anon;
revoke execute on function public.apply_free_play_badge_settlement(uuid, jsonb) from authenticated;
revoke execute on function public.apply_free_play_badge_settlement(uuid, jsonb) from service_role;

-- =============================================================================
-- Section G — classifier and constraint parity (assert only; no replacement)
-- BR0F export review: games/match_requests checks + classifiers reported good.
-- Daily precedence preserved via live 20260619171000 body (not reasserted here).
-- =============================================================================

do $classifier_parity$
begin
  if to_regprocedure('public.classify_rating_bucket(text,text,text)') is null then
    raise exception 'BR1 parity: classify_rating_bucket missing';
  end if;
  if to_regprocedure('public.classify_p1_rating_bucket(text,text,text)') is null then
    raise exception 'BR1 parity: classify_p1_rating_bucket missing';
  end if;
  if to_regprocedure('public.classify_free_badge_track_key(text,text)') is null then
    raise exception 'BR1 parity: classify_free_badge_track_key missing';
  end if;
  if to_regprocedure('public.free_play_queue_slot_key(text,text,boolean)') is null then
    raise exception 'BR1 parity: free_play_queue_slot_key missing';
  end if;

  if not exists (
    select 1 from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname = 'games'
      and c.conname = 'games_live_time_control_check'
  ) then
    raise exception 'BR1 parity: games_live_time_control_check missing';
  end if;

  if not exists (
    select 1 from pg_constraint c
    join pg_class r on r.oid = c.conrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname = 'match_requests'
      and c.conname = 'match_requests_live_time_control_check'
  ) then
    raise exception 'BR1 parity: match_requests_live_time_control_check missing';
  end if;
end;
$classifier_parity$;

-- =============================================================================
-- Section H — rating core and ledger authority (preserve; no replacement)
-- =============================================================================

-- Preserved without CREATE OR REPLACE:
--   elo_k_factor_for_games_played
--   elo_expected_score
--   append_rating_history_ledger_for_game_apply
--   apply_free_play_rating_update_core
-- Floor 100, ceiling 4000, v2_elo_free free-play, v1_fixed_tournament tournament.
-- Mode ledger writes remain active; exact_time_control ledger writes stay disabled
-- because apply_free_play_badge_settlement returns applied = false.

create table if not exists public.player_rating_history_ledger (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  rating_track_id text not null,
  ecosystem text not null,
  rating_scope text not null,
  mode text null,
  time_control text null,
  badge_track_key text null,
  event_type text not null,
  game_id uuid null references public.games (id) on delete set null,
  tournament_id uuid null,
  bracket_id uuid null,
  section_id uuid null,
  opponent_id uuid null references public.profiles (id) on delete set null,
  opponent_username text null,
  result text null,
  rating_before integer not null,
  rating_after integer not null,
  rating_delta integer not null,
  occurred_at timestamptz not null,
  badge_state_before text null,
  badge_state_after text null,
  badge_event_type text null,
  badge_pressure_border int null,
  win_streak int null,
  is_synthetic boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists uniq_rating_history_game_track
  on public.player_rating_history_ledger (player_id, rating_track_id, game_id, event_type)
  where game_id is not null and event_type = 'game';

create unique index if not exists uniq_rating_history_backfill_game_track
  on public.player_rating_history_ledger (player_id, rating_track_id, game_id, event_type)
  where game_id is not null and event_type = 'backfill';

create unique index if not exists uniq_rating_history_bracket_settlement
  on public.player_rating_history_ledger (player_id, rating_track_id, bracket_id, event_type)
  where bracket_id is not null and event_type = 'bracket_settlement';

create unique index if not exists uniq_rating_history_tournament_batch
  on public.player_rating_history_ledger (player_id, rating_track_id, tournament_id, event_type)
  where tournament_id is not null and event_type = 'tournament_batch';

-- =============================================================================
-- Section I — post-apply convergence assertions
-- =============================================================================

do $br1_post$
declare
  v_badge_rows bigint;
  v_settlement_shim_def text;
  v_state_shim_def text;
  v_core_def text;
  v_snapshot_def text;
  v_accl_overall bigint;
  v_write_policy_count int;
begin
  if to_regclass('public.player_badge_state') is null then
    raise exception 'BR1 post-check failed: player_badge_state missing';
  end if;

  if to_regclass('public.accl_badge_rank_bands') is null then
    raise exception 'BR1 post-check failed: accl_badge_rank_bands missing';
  end if;

  select count(*) into v_badge_rows from public.player_badge_state;
  if v_badge_rows > 0 then
    raise exception
      'BR1 post-check failed: player_badge_state must be empty after apply (found %)',
      v_badge_rows;
  end if;

  select pg_get_functiondef('public.apply_free_play_badge_settlement(uuid,jsonb)'::regprocedure)
  into v_settlement_shim_def;

  if position('stage3_badge_settlement_disabled' in lower(v_settlement_shim_def)) = 0 then
    raise exception
      'BR1 post-check failed: apply_free_play_badge_settlement missing stage3_badge_settlement_disabled reason';
  end if;

  if position('accl_stage3_badge_settlement_disabled' in lower(
    coalesce((
      select d.description
      from pg_proc p
      left join pg_description d on d.objoid = p.oid and d.classoid = 'pg_proc'::regclass
      where p.oid = 'public.apply_free_play_badge_settlement(uuid,jsonb)'::regprocedure
    ), '')
  )) = 0 then
    raise exception
      'BR1 post-check failed: apply_free_play_badge_settlement missing ACCL_STAGE3_BADGE_SETTLEMENT_DISABLED comment marker';
  end if;

  select pg_get_functiondef('public.settle_player_badge_state(uuid,text,int,int,int,uuid)'::regprocedure)
  into v_state_shim_def;

  if position('stage3_badge_state_mutation_disabled' in lower(v_state_shim_def)) = 0 then
    raise exception
      'BR1 post-check failed: settle_player_badge_state missing stage3_badge_state_mutation_disabled reason';
  end if;

  if position('accl_stage3_badge_state_mutation_disabled' in lower(
    coalesce((
      select d.description
      from pg_proc p
      left join pg_description d on d.objoid = p.oid and d.classoid = 'pg_proc'::regclass
      where p.oid = 'public.settle_player_badge_state(uuid,text,int,int,int,uuid)'::regprocedure
    ), '')
  )) = 0 then
    raise exception
      'BR1 post-check failed: settle_player_badge_state missing ACCL_STAGE3_BADGE_STATE_MUTATION_DISABLED comment marker';
  end if;

  if has_function_privilege('anon', 'public.apply_free_play_badge_settlement(uuid,jsonb)', 'EXECUTE') then
    raise exception 'BR1 post-check failed: anon has EXECUTE on apply_free_play_badge_settlement';
  end if;

  if has_function_privilege('authenticated', 'public.apply_free_play_badge_settlement(uuid,jsonb)', 'EXECUTE') then
    raise exception 'BR1 post-check failed: authenticated has EXECUTE on apply_free_play_badge_settlement';
  end if;

  if has_function_privilege('service_role', 'public.apply_free_play_badge_settlement(uuid,jsonb)', 'EXECUTE') then
    raise exception 'BR1 post-check failed: service_role has EXECUTE on apply_free_play_badge_settlement';
  end if;

  if has_function_privilege('anon', 'public.settle_player_badge_state(uuid,text,int,int,int,uuid)', 'EXECUTE') then
    raise exception 'BR1 post-check failed: anon has EXECUTE on settle_player_badge_state';
  end if;

  if has_function_privilege('authenticated', 'public.settle_player_badge_state(uuid,text,int,int,int,uuid)', 'EXECUTE') then
    raise exception 'BR1 post-check failed: authenticated has EXECUTE on settle_player_badge_state';
  end if;

  if has_function_privilege('service_role', 'public.settle_player_badge_state(uuid,text,int,int,int,uuid)', 'EXECUTE') then
    raise exception 'BR1 post-check failed: service_role has EXECUTE on settle_player_badge_state';
  end if;

  if has_table_privilege('anon', 'public.player_badge_state', 'INSERT')
     or has_table_privilege('anon', 'public.player_badge_state', 'UPDATE')
     or has_table_privilege('anon', 'public.player_badge_state', 'DELETE') then
    raise exception 'BR1 post-check failed: anon has write privilege on player_badge_state';
  end if;

  if has_table_privilege('authenticated', 'public.player_badge_state', 'INSERT')
     or has_table_privilege('authenticated', 'public.player_badge_state', 'UPDATE')
     or has_table_privilege('authenticated', 'public.player_badge_state', 'DELETE') then
    raise exception 'BR1 post-check failed: authenticated has write privilege on player_badge_state';
  end if;

  if has_table_privilege('service_role', 'public.player_badge_state', 'INSERT')
     or has_table_privilege('service_role', 'public.player_badge_state', 'UPDATE')
     or has_table_privilege('service_role', 'public.player_badge_state', 'DELETE') then
    raise exception 'BR1 post-check failed: service_role has write privilege on player_badge_state';
  end if;

  select count(*) into v_write_policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'player_badge_state'
    and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL');

  if v_write_policy_count > 0 then
    raise exception
      'BR1 post-check failed: player_badge_state has % write RLS policies',
      v_write_policy_count;
  end if;

  if exists (
    select 1
    from pg_trigger t
    join pg_class r on r.oid = t.tgrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname = 'games'
      and t.tgname = 'games_apply_rating'
      and not t.tgisinternal
  ) then
    raise exception 'BR1 post-check failed: orphan games_apply_rating trigger still present';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    join pg_class r on r.oid = t.tgrelid
    join pg_namespace n on n.oid = r.relnamespace
    where n.nspname = 'public'
      and r.relname = 'games'
      and t.tgname = 'games_apply_free_rating_after_finish'
      and not t.tgisinternal
  ) then
    raise exception 'BR1 post-check failed: canonical games_apply_free_rating_after_finish trigger missing';
  end if;

  select pg_get_functiondef('public.apply_free_play_rating_update_core(uuid)'::regprocedure)
  into v_core_def;

  if position('v2_elo_free' in lower(v_core_def)) = 0 then
    raise exception 'BR1 post-check failed: apply_free_play_rating_update_core missing v2_elo_free marker';
  end if;

  if to_regprocedure('public.get_public_profile_snapshot(uuid)') is not null then
    select pg_get_functiondef('public.get_public_profile_snapshot(uuid)'::regprocedure)
    into v_snapshot_def;

    if position('''accl_rating'', v_tu' in lower(v_snapshot_def)) = 0
       and position('accl_rating' in lower(v_snapshot_def)) > 0
       and position('tournament_unified' in lower(v_snapshot_def)) = 0 then
      raise exception
        'BR1 post-check failed: get_public_profile_snapshot accl_rating alias may have changed';
    end if;
  end if;

  if to_regclass('public.player_ratings') is not null then
    select count(*) into v_accl_overall
    from public.player_ratings
    where bucket = 'accl_overall';

    if v_accl_overall > 0 then
      raise exception
        'BR1 post-check failed: accl_overall rows present (%)',
        v_accl_overall;
    end if;
  end if;
end;
$br1_post$;
