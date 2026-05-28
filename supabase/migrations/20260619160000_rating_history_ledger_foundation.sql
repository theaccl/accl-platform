-- Rating-history ledger foundation: append-only authoritative events per player/track.
-- Writes hook into apply_free_play_rating_update_core; does not remove games.rating_last_update.

-- ---------------------------------------------------------------------------
-- Ledger table
-- ---------------------------------------------------------------------------
create table if not exists public.player_rating_history_ledger (
  id uuid primary key default gen_random_uuid(),

  player_id uuid not null references public.profiles (id) on delete cascade,

  rating_track_id text not null,

  ecosystem text not null check (
    ecosystem in ('global', 'free', 'tournament', 'league', 'event')
  ),

  rating_scope text not null check (
    rating_scope in ('overall', 'mode', 'exact_time_control', 'tournament', 'event')
  ),

  mode text null check (
    mode is null or mode in ('bullet', 'blitz', 'rapid', 'daily')
  ),

  time_control text null,

  badge_track_key text null,

  event_type text not null check (
    event_type in (
      'game',
      'tournament_batch',
      'bracket_settlement',
      'manual_admin_adjustment',
      'backfill'
    )
  ),

  game_id uuid null references public.games (id) on delete set null,
  tournament_id uuid null,
  bracket_id uuid null,
  section_id uuid null,

  opponent_id uuid null references public.profiles (id) on delete set null,
  opponent_username text null,

  result text null check (
    result is null or result in (
      'win',
      'loss',
      'draw',
      'event_settlement',
      'admin_adjustment',
      'unknown'
    )
  ),

  rating_before integer not null,
  rating_after integer not null,
  rating_delta integer not null,

  occurred_at timestamptz not null,

  badge_state_before text null check (
    badge_state_before is null or badge_state_before in (
      'normal',
      'shiny',
      'upgraded',
      'downgraded',
      'cracked',
      'recovery'
    )
  ),

  badge_state_after text null check (
    badge_state_after is null or badge_state_after in (
      'normal',
      'shiny',
      'upgraded',
      'downgraded',
      'cracked',
      'recovery'
    )
  ),

  badge_event text null check (
    badge_event is null or badge_event in (
      'none',
      'upgrade_armed',
      'upgrade_confirmed',
      'downgrade_armed',
      'downgrade_confirmed',
      'recovered_to_normal',
      'shiny_earned',
      'shiny_lost',
      'manual_adjustment'
    )
  ),

  streak_before integer null,
  streak_after integer null,

  rating_model_version text not null default 'v1',
  source_table text null,
  source_id text null,
  source_hash text null,

  is_backfilled boolean not null default false,

  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now()
);

comment on table public.player_rating_history_ledger is
  'Append-only rating movement events per player/track. Profile ticker backbone; finished games and settlements only.';

create index if not exists idx_player_rating_history_player_track_time
  on public.player_rating_history_ledger (player_id, rating_track_id, occurred_at);

create index if not exists idx_player_rating_history_player_time
  on public.player_rating_history_ledger (player_id, occurred_at desc);

create index if not exists idx_player_rating_history_game
  on public.player_rating_history_ledger (game_id)
  where game_id is not null;

create index if not exists idx_player_rating_history_tournament
  on public.player_rating_history_ledger (tournament_id)
  where tournament_id is not null;

create index if not exists idx_player_rating_history_badge_track
  on public.player_rating_history_ledger (player_id, badge_track_key, occurred_at)
  where badge_track_key is not null;

create unique index if not exists uniq_rating_history_game_track
  on public.player_rating_history_ledger (player_id, rating_track_id, game_id)
  where event_type = 'game' and game_id is not null;

create unique index if not exists uniq_rating_history_backfill_game_track
  on public.player_rating_history_ledger (player_id, rating_track_id, game_id)
  where event_type = 'backfill' and game_id is not null;

create unique index if not exists uniq_rating_history_bracket_settlement
  on public.player_rating_history_ledger (player_id, rating_track_id, tournament_id, bracket_id)
  where event_type = 'bracket_settlement'
  and tournament_id is not null
  and bracket_id is not null;

create unique index if not exists uniq_rating_history_tournament_batch
  on public.player_rating_history_ledger (player_id, rating_track_id, tournament_id, section_id)
  where event_type = 'tournament_batch'
  and tournament_id is not null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.player_rating_history_ledger enable row level security;

drop policy if exists "player_rating_history_ledger_select_own" on public.player_rating_history_ledger;
create policy "player_rating_history_ledger_select_own"
  on public.player_rating_history_ledger
  for select
  to authenticated
  using (auth.uid() = player_id);

drop policy if exists "player_rating_history_ledger_service_role_all" on public.player_rating_history_ledger;
create policy "player_rating_history_ledger_service_role_all"
  on public.player_rating_history_ledger
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.player_rating_history_ledger from anon;
grant select on table public.player_rating_history_ledger to authenticated;
grant all on table public.player_rating_history_ledger to service_role;

-- ---------------------------------------------------------------------------
-- Mapping helpers (stable track ids; align with lib/acclTimeControls + Profile)
-- ---------------------------------------------------------------------------
create or replace function public.map_p1_bucket_to_rating_track_id(p_bucket text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(p_bucket, '')))
    when 'free_bullet' then 'free_bullet'
    when 'free_blitz' then 'free_blitz'
    when 'free_rapid' then 'free_rapid'
    when 'free_day' then 'free_day'
    when 'tournament_unified' then 'tournament'
    else null
  end;
$$;

create or replace function public.map_badge_track_key_to_rating_track_id(p_badge_track_key text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(p_badge_track_key, '')))
    when 'bullet_1_0' then 'free_bullet_1_0'
    when 'bullet_1_1' then 'free_bullet_1_1'
    when 'bullet_2_0' then 'free_bullet_2_0'
    when 'bullet_2_1' then 'free_bullet_2_1'
    when 'blitz_3_0' then 'free_blitz_3_0'
    when 'blitz_3_2' then 'free_blitz_3_2'
    when 'blitz_5_0' then 'free_blitz_5_0'
    when 'blitz_5_5' then 'free_blitz_5_5'
    when 'rapid_10_0' then 'free_rapid_10_0'
    when 'rapid_15_0' then 'free_rapid_15_0'
    when 'rapid_20_0' then 'free_rapid_20_0'
    when 'rapid_30_0' then 'free_rapid_30_0'
    when 'rapid_60_0' then 'free_rapid_60_0'
    when 'daily_1_day' then 'free_daily_1d'
    when 'daily_2_day' then 'free_daily_2d'
    when 'daily_3_day' then 'free_daily_3d'
    when 'daily_5_day' then 'free_daily_5d'
    when 'daily_7_day' then 'free_daily_7d'
    else null
  end;
$$;

create or replace function public.map_p1_bucket_to_rating_mode(p_bucket text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(p_bucket, '')))
    when 'free_bullet' then 'bullet'
    when 'free_blitz' then 'blitz'
    when 'free_rapid' then 'rapid'
    when 'free_day' then 'daily'
    else null
  end;
$$;

create or replace function public.map_badge_visual_to_ledger(p_visual text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(p_visual, '')))
    when 'upgraded' then 'shiny'
    when 'downgraded' then 'downgraded'
    when 'normal' then 'normal'
    else null
  end;
$$;

create or replace function public.map_badge_event_to_ledger(p_event text)
returns text
language sql
immutable
as $$
  select case lower(trim(coalesce(p_event, '')))
    when 'demotion_armed' then 'downgrade_armed'
    when 'demotion_confirmed' then 'downgrade_confirmed'
    when 'demotion_pressure_cleared' then 'recovered_to_normal'
    when 'downgrade_repaired' then 'recovered_to_normal'
    when 'promotion_upgrade' then 'upgrade_confirmed'
    when 'streak_upgrade' then 'shiny_earned'
    when 'upgrade_lost_on_defeat' then 'shiny_lost'
    when 'none' then 'none'
    else null
  end;
$$;

create or replace function public.rating_history_result_for_player(
  p_game_result text,
  p_player_id uuid,
  p_white_id uuid,
  p_black_id uuid
)
returns text
language plpgsql
immutable
as $$
begin
  if p_game_result in ('draw', '1/2-1/2') then
    return 'draw';
  end if;
  if p_game_result = 'white_win' then
    return case when p_player_id = p_white_id then 'win' else 'loss' end;
  end if;
  if p_game_result = 'black_win' then
    return case when p_player_id = p_black_id then 'win' else 'loss' end;
  end if;
  return 'unknown';
end;
$$;

-- ---------------------------------------------------------------------------
-- Insert one ledger row (idempotent via partial unique indexes)
-- ---------------------------------------------------------------------------
create or replace function public.rating_history_ledger_insert_row(
  p_player_id uuid,
  p_rating_track_id text,
  p_ecosystem text,
  p_rating_scope text,
  p_mode text,
  p_time_control text,
  p_badge_track_key text,
  p_event_type text,
  p_game_id uuid,
  p_opponent_id uuid,
  p_result text,
  p_rating_before int,
  p_rating_after int,
  p_rating_delta int,
  p_occurred_at timestamptz,
  p_badge_state_before text,
  p_badge_state_after text,
  p_badge_event text,
  p_streak_before int,
  p_streak_after int,
  p_is_backfilled boolean,
  p_metadata jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_opp_name text;
begin
  if p_player_id is null or p_rating_track_id is null or p_rating_track_id = '' then
    return null;
  end if;

  if p_rating_before is null or p_rating_after is null or p_rating_delta is null then
    return null;
  end if;

  select nullif(trim(coalesce(username, '')), '') into v_opp_name
  from public.profiles
  where id = p_opponent_id;

  insert into public.player_rating_history_ledger (
    player_id,
    rating_track_id,
    ecosystem,
    rating_scope,
    mode,
    time_control,
    badge_track_key,
    event_type,
    game_id,
    opponent_id,
    opponent_username,
    result,
    rating_before,
    rating_after,
    rating_delta,
    occurred_at,
    badge_state_before,
    badge_state_after,
    badge_event,
    streak_before,
    streak_after,
    rating_model_version,
    source_table,
    source_id,
    is_backfilled,
    metadata
  )
  values (
    p_player_id,
    p_rating_track_id,
    p_ecosystem,
    p_rating_scope,
    p_mode,
    p_time_control,
    p_badge_track_key,
    p_event_type,
    p_game_id,
    p_opponent_id,
    v_opp_name,
    p_result,
    p_rating_before,
    p_rating_after,
    p_rating_delta,
    p_occurred_at,
    p_badge_state_before,
    p_badge_state_after,
    p_badge_event,
    p_streak_before,
    p_streak_after,
    'v1',
    'games',
    case when p_game_id is not null then p_game_id::text else null end,
    coalesce(p_is_backfilled, false),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict do nothing
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Safe permissions for ledger helper functions
-- Uses pg_proc/regprocedure so we do not break on exact signature formatting.
-- ---------------------------------------------------------------------------

do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname = 'rating_history_ledger_insert_row'
  loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Append ledger rows for one finished rated game apply snapshot
-- ---------------------------------------------------------------------------
create or replace function public.append_rating_history_ledger_for_game_apply(
  p_game_id uuid,
  p_rating_snapshot jsonb,
  p_badge_snapshot jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games%rowtype;
  v_ctx text;
  v_eco text;
  v_p1 text;
  v_mode_track text;
  v_mode text;
  v_occurred timestamptz;
  v_ins int := 0;
  v_skip int := 0;
  v_badge_track text;
  v_exact_track text;
  v_uid uuid;
  v_opp uuid;
  v_side jsonb;
  v_ticker jsonb;
  v_result text;
  v_players uuid[] := array[]::uuid[];
  v_i int;
begin
  select * into g from public.games where id = p_game_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'game_not_found');
  end if;

  if coalesce(p_rating_snapshot->>'applied', '') <> 'true' then
    return jsonb_build_object('ok', false, 'reason', 'snapshot_not_applied');
  end if;

  v_ctx := lower(trim(coalesce(g.play_context, 'free')));
  if v_ctx = '' then
    v_ctx := 'free';
  end if;
  v_eco := case when v_ctx = 'tournament' then 'tournament' else 'free' end;
  v_p1 := coalesce(p_rating_snapshot->>'p1_bucket', '');
  v_mode_track := public.map_p1_bucket_to_rating_track_id(v_p1);
  v_mode := public.map_p1_bucket_to_rating_mode(v_p1);
  v_occurred := coalesce(g.finished_at, g.created_at, now());

  v_players := array[g.white_player_id, g.black_player_id];

  for v_i in 1..2 loop
    v_uid := v_players[v_i];
    if v_uid is null then
      v_skip := v_skip + 1;
      continue;
    end if;

    v_opp := case when v_uid = g.white_player_id then g.black_player_id else g.white_player_id end;
    v_result := public.rating_history_result_for_player(g.result, v_uid, g.white_player_id, g.black_player_id);

    if v_mode_track is not null then
      v_side := case
        when v_uid = g.white_player_id then p_rating_snapshot->'p1_white'
        else p_rating_snapshot->'p1_black'
      end;

      if v_side is not null
         and (v_side->>'before') is not null
         and (v_side->>'after') is not null then
        perform public.rating_history_ledger_insert_row(
          v_uid,
          v_mode_track,
          v_eco,
          'mode',
          v_mode,
          g.live_time_control,
          null,
          'game',
          p_game_id,
          v_opp,
          v_result,
          (v_side->>'before')::int,
          (v_side->>'after')::int,
          coalesce((v_side->>'delta')::int, (v_side->>'after')::int - (v_side->>'before')::int),
          v_occurred,
          null,
          null,
          null,
          null,
          null,
          false,
          jsonb_build_object('p1_bucket', v_p1, 'legacy_bucket', p_rating_snapshot->>'bucket')
        );
        v_ins := v_ins + 1;
      else
        v_skip := v_skip + 1;
      end if;
    else
      v_skip := v_skip + 1;
    end if;

    if v_eco = 'free' and p_badge_snapshot is not null and coalesce(p_badge_snapshot->>'applied', '') = 'true' then
      v_badge_track := coalesce(p_badge_snapshot->>'track_key', '');
      v_exact_track := public.map_badge_track_key_to_rating_track_id(v_badge_track);
      v_ticker := case when v_uid = g.white_player_id then p_badge_snapshot->'white' else p_badge_snapshot->'black' end;

      if v_exact_track is not null
         and v_ticker is not null
         and (v_ticker->>'rating_before') is not null
         and (v_ticker->>'rating_after') is not null then
        perform public.rating_history_ledger_insert_row(
          v_uid,
          v_exact_track,
          'free',
          'exact_time_control',
          public.map_p1_bucket_to_rating_mode(v_p1),
          g.live_time_control,
          v_badge_track,
          'game',
          p_game_id,
          v_opp,
          v_result,
          coalesce((v_ticker->>'rating_before')::int, 0),
          coalesce((v_ticker->>'rating_after')::int, 0),
          coalesce((v_ticker->>'rating_delta')::int, 0),
          v_occurred,
          null,
          public.map_badge_visual_to_ledger(v_ticker->>'visual_state'),
          public.map_badge_event_to_ledger(v_ticker->>'event_type'),
          null,
          coalesce((v_ticker->>'win_streak')::int, null),
          false,
          jsonb_build_object('badge_track_key', v_badge_track)
        );
        v_ins := v_ins + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'insert_attempts', v_ins,
    'skipped', v_skip,
    'p1_bucket', v_p1,
    'mode_track', v_mode_track
  );
end;
$$;

do $$
declare
  fn regprocedure;
begin
  for fn in
    select p.oid::regprocedure
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname = 'append_rating_history_ledger_for_game_apply'
  loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Own-profile read RPC (conservative; no public broad select)
-- ---------------------------------------------------------------------------
create or replace function public.get_own_rating_history_ledger(
  p_rating_track_id text,
  p_limit integer default 100
)
returns setof public.player_rating_history_ledger
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_lim int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  v_lim := greatest(1, least(coalesce(p_limit, 100), 500));

  return query
  select l.*
  from public.player_rating_history_ledger l
  where l.player_id = v_uid
    and (p_rating_track_id is null or p_rating_track_id = '' or l.rating_track_id = p_rating_track_id)
  order by l.occurred_at asc
  limit v_lim;
end;
$$;

revoke all on function public.get_own_rating_history_ledger(text, integer) from public;
grant execute on function public.get_own_rating_history_ledger(text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Hook apply_free_play_rating_update_core (preserve badge + rating_last_update)
-- ---------------------------------------------------------------------------
create or replace function public.apply_free_play_rating_update_core(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.games%rowtype;
  v_legacy text;
  v_p1 text;
  w_before_l int;
  b_before_l int;
  w_before_p int;
  b_before_p int;
  w_delta int := 0;
  b_delta int := 0;
  w_after_l int;
  b_after_l int;
  w_after_p int;
  b_after_p int;
  w_gp_l int;
  b_gp_l int;
  w_gp_p int;
  b_gp_p int;
  ctx text;
  out jsonb;
  v_games_updated int;
  v_move_count int;
  v_badge jsonb;
  v_ledger jsonb;
begin
  select * into r from public.games where id = p_game_id for update;
  if not found then
    return jsonb_build_object('applied', false, 'reason', 'game_not_found');
  end if;

  if r.status <> 'finished' then
    return jsonb_build_object('applied', false, 'reason', 'not_finished');
  end if;

  if lower(trim(coalesce(r.end_reason, ''))) in (
    'superseded',
    'expired_open_seat',
    'abandoned_before_move',
    'no_first_move'
  ) then
    return jsonb_build_object(
      'applied', false,
      'reason', 'lifecycle_void_finish',
      'end_reason', r.end_reason
    );
  end if;

  select count(*)::int into v_move_count
  from public.game_move_logs
  where game_id = p_game_id;

  if coalesce(v_move_count, 0) = 0 then
    return jsonb_build_object(
      'applied', false,
      'reason', 'zero_move_void',
      'move_count', 0,
      'end_reason', r.end_reason
    );
  end if;

  if coalesce(r.rating_applied, false) then
    return coalesce(
      r.rating_last_update,
      '{}'::jsonb
    ) || jsonb_build_object(
      'applied', false,
      'reason', 'already_applied'
    );
  end if;

  ctx := lower(trim(coalesce(r.play_context, 'free')));
  if ctx = '' then
    ctx := 'free';
  end if;
  if ctx <> 'free' and ctx <> 'tournament' then
    return jsonb_build_object('applied', false, 'reason', 'not_free_play');
  end if;

  if r.rated is not true then
    return jsonb_build_object(
      'applied', false,
      'reason', 'unrated',
      'bucket', null
    );
  end if;

  if r.white_player_id is null
     or r.black_player_id is null
     or r.white_player_id = r.black_player_id then
    return jsonb_build_object('applied', false, 'reason', 'not_both_seated');
  end if;

  v_legacy := public.classify_rating_bucket(
    ctx,
    r.tempo,
    r.live_time_control
  );
  v_p1 := public.classify_p1_rating_bucket(
    ctx,
    r.tempo,
    r.live_time_control
  );

  if v_legacy is null then
    return jsonb_build_object(
      'applied', false,
      'reason', 'invalid_time_control',
      'bucket', null,
      'p1_bucket', null
    );
  end if;

  if v_p1 is null then
    return jsonb_build_object(
      'applied', false,
      'reason', 'invalid_time_control_p1',
      'bucket', v_legacy,
      'p1_bucket', null
    );
  end if;

  if r.result in ('draw', '1/2-1/2') then
    w_delta := 0;
    b_delta := 0;
  elsif r.result = 'white_win' or r.winner_id = r.white_player_id then
    w_delta := 10;
    b_delta := -10;
  elsif r.result = 'black_win' or r.winner_id = r.black_player_id then
    w_delta := -10;
    b_delta := 10;
  else
    return jsonb_build_object(
      'applied', false,
      'reason', 'unknown_result',
      'bucket', v_legacy,
      'p1_bucket', v_p1
    );
  end if;

  insert into public.player_ratings (user_id, bucket, rating, games_played)
  values (r.white_player_id, v_legacy, 1500, 0)
  on conflict (user_id, bucket) do nothing;
  insert into public.player_ratings (user_id, bucket, rating, games_played)
  values (r.black_player_id, v_legacy, 1500, 0)
  on conflict (user_id, bucket) do nothing;

  insert into public.player_ratings (user_id, bucket, rating, games_played)
  values (r.white_player_id, v_p1, 1500, 0)
  on conflict (user_id, bucket) do nothing;
  insert into public.player_ratings (user_id, bucket, rating, games_played)
  values (r.black_player_id, v_p1, 1500, 0)
  on conflict (user_id, bucket) do nothing;

  select rating, games_played into strict w_before_l, w_gp_l
  from public.player_ratings
  where user_id = r.white_player_id and bucket = v_legacy
  for update;
  select rating, games_played into strict b_before_l, b_gp_l
  from public.player_ratings
  where user_id = r.black_player_id and bucket = v_legacy
  for update;

  select rating, games_played into strict w_before_p, w_gp_p
  from public.player_ratings
  where user_id = r.white_player_id and bucket = v_p1
  for update;
  select rating, games_played into strict b_before_p, b_gp_p
  from public.player_ratings
  where user_id = r.black_player_id and bucket = v_p1
  for update;

  w_after_l := greatest(100, least(4000, w_before_l + w_delta));
  b_after_l := greatest(100, least(4000, b_before_l + b_delta));
  w_after_p := greatest(100, least(4000, w_before_p + w_delta));
  b_after_p := greatest(100, least(4000, b_before_p + b_delta));

  update public.player_ratings
  set
    rating = w_after_l,
    games_played = games_played + 1,
    updated_at = now()
  where user_id = r.white_player_id and bucket = v_legacy;

  get diagnostics v_games_updated = row_count;
  if v_games_updated <> 1 then
    raise exception 'apply_free_play_rating_update_core: legacy white update expected 1 row, got %', v_games_updated;
  end if;

  update public.player_ratings
  set
    rating = b_after_l,
    games_played = games_played + 1,
    updated_at = now()
  where user_id = r.black_player_id and bucket = v_legacy;

  get diagnostics v_games_updated = row_count;
  if v_games_updated <> 1 then
    raise exception 'apply_free_play_rating_update_core: legacy black update expected 1 row, got %', v_games_updated;
  end if;

  update public.player_ratings
  set
    rating = w_after_p,
    games_played = games_played + 1,
    updated_at = now()
  where user_id = r.white_player_id and bucket = v_p1;

  get diagnostics v_games_updated = row_count;
  if v_games_updated <> 1 then
    raise exception 'apply_free_play_rating_update_core: p1 white update expected 1 row, got %', v_games_updated;
  end if;

  update public.player_ratings
  set
    rating = b_after_p,
    games_played = games_played + 1,
    updated_at = now()
  where user_id = r.black_player_id and bucket = v_p1;

  get diagnostics v_games_updated = row_count;
  if v_games_updated <> 1 then
    raise exception 'apply_free_play_rating_update_core: p1 black update expected 1 row, got %', v_games_updated;
  end if;

  out := jsonb_build_object(
    'applied', true,
    'reason', 'ok',
    'bucket', v_legacy,
    'p1_bucket', v_p1,
    'play_context', ctx,
    'white', jsonb_build_object(
      'user_id', r.white_player_id,
      'before', w_before_l,
      'after', w_after_l,
      'delta', w_delta,
      'games_played_before', w_gp_l,
      'games_played_after', w_gp_l + 1
    ),
    'black', jsonb_build_object(
      'user_id', r.black_player_id,
      'before', b_before_l,
      'after', b_after_l,
      'delta', b_delta,
      'games_played_before', b_gp_l,
      'games_played_after', b_gp_l + 1
    ),
    'p1_white', jsonb_build_object(
      'user_id', r.white_player_id,
      'before', w_before_p,
      'after', w_after_p,
      'delta', w_delta,
      'games_played_before', w_gp_p,
      'games_played_after', w_gp_p + 1
    ),
    'p1_black', jsonb_build_object(
      'user_id', r.black_player_id,
      'before', b_before_p,
      'after', b_after_p,
      'delta', b_delta,
      'games_played_before', b_gp_p,
      'games_played_after', b_gp_p + 1
    )
  );

  if ctx = 'free' then
    v_badge := public.apply_free_play_badge_settlement(p_game_id, out);
    out := out || jsonb_build_object('badge', v_badge);
  end if;

  v_ledger := public.append_rating_history_ledger_for_game_apply(p_game_id, out, v_badge);
  out := out || jsonb_build_object('ledger', v_ledger);

  update public.games
  set
    rating_applied = true,
    rating_last_update = out
  where id = p_game_id and coalesce(rating_applied, false) is not true;

  get diagnostics v_games_updated = row_count;
  if v_games_updated = 0 then
    return jsonb_build_object('applied', false, 'reason', 'concurrent_apply_or_already_applied');
  end if;

  return out;
end;
$$;

comment on function public.apply_free_play_rating_update_core(uuid) is
  'Dual-write rating apply; free-play badge settlement + rating history ledger append.';
