-- Phase 1: free-play per-track badge settlement (settlement_rating + pressure + visual state).
-- Keep settlement rules aligned with lib/badgeSettlement.ts and lib/badgeTracks.ts.

-- ---------------------------------------------------------------------------
-- Reference: rank bands (display / audit; logic also in settle functions)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Per-player per exact-track badge state
-- ---------------------------------------------------------------------------
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
  'Backend-owned free-play badge truth per exact time-control track; tournament tracks are Phase 2.';

comment on column public.player_badge_state.settlement_rating is
  'Canonical per-track rating for badge math (independent of P1 mode buckets and tournament_unified).';

alter table public.player_badge_state enable row level security;

create policy "player_badge_state_select_own"
  on public.player_badge_state for select
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.player_badge_state from anon;
grant select on table public.player_badge_state to authenticated;

-- ---------------------------------------------------------------------------
-- Classify exact free-play badge track from game tempo + clock
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Rank band helpers (mirror lib/badgeTracks.ts)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Settle one player/track (returns state + ticker json)
-- ---------------------------------------------------------------------------
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
declare
  v_row public.player_badge_state%rowtype;
  v_band_before text;
  v_band_after text;
  v_border_before int;
  v_visual text;
  v_pressure text;
  v_pressure_border int;
  v_streak int;
  v_event text := 'none';
  v_status text := 'Stable';
  v_next text;
  v_danger int;
  v_entered_danger boolean;
begin
  select * into v_row
  from public.player_badge_state
  where user_id = p_user_id and track_key = p_track_key
  for update;

  if not found then
    insert into public.player_badge_state (
      user_id,
      track_key,
      settlement_rating,
      active_rank_band,
      visual_state,
      pressure_state,
      win_streak
    )
    values (
      p_user_id,
      p_track_key,
      1500,
      public.badge_rank_band_from_rating(1500),
      'normal',
      'stable',
      0
    )
    returning * into v_row;
  end if;

  v_band_before := public.badge_rank_band_from_rating(p_rating_before);
  v_band_after := public.badge_rank_band_from_rating(p_rating_after);
  v_border_before := public.badge_lower_border_for_band(v_band_before);

  v_visual := v_row.visual_state;
  v_pressure := v_row.pressure_state;
  v_pressure_border := v_row.pressure_border;
  v_streak := v_row.win_streak;

  if p_delta > 0 then
    v_streak := v_row.win_streak + 1;
    if v_visual = 'downgraded' then
      v_visual := 'normal';
      v_event := 'downgrade_repaired';
      v_status := 'Downgrade repaired';
      v_next := 'Win restored normal badge. Three wins in this track earn upgraded.';
    elsif v_visual = 'normal' and v_streak >= 3 then
      v_visual := 'upgraded';
      v_event := 'streak_upgrade';
      v_status := 'Upgraded (win streak)';
      v_next := 'One loss in this track returns to normal badge.';
    end if;

    if v_pressure = 'demotion_armed' and v_pressure_border is not null then
      if p_rating_after >= v_pressure_border then
        v_pressure := 'stable';
        v_pressure_border := null;
        if v_event = 'none' then
          v_event := 'demotion_pressure_cleared';
          v_status := 'Recovered';
          v_next := 'Demotion pressure cleared.';
        end if;
      end if;
    end if;

    if public.badge_band_sort_order(v_band_after) > public.badge_band_sort_order(v_band_before)
       and v_row.pressure_state is distinct from 'demotion_armed' then
      v_visual := 'upgraded';
      v_event := 'promotion_upgrade';
      v_status := 'Promotion upgrade';
      v_next := 'One loss in this track returns to normal badge.';
      v_pressure := 'stable';
      v_pressure_border := null;
    end if;
  elsif p_delta < 0 then
    v_streak := 0;
    if v_visual = 'upgraded' then
      v_visual := 'normal';
      v_event := 'upgrade_lost_on_defeat';
      v_status := 'Upgrade lost';
      v_next := 'Win three games in this track to earn upgraded again.';
    end if;

    if v_pressure = 'demotion_armed' and v_pressure_border is not null then
      if p_rating_after < v_pressure_border and p_delta < 0 then
        v_visual := 'downgraded';
        v_pressure := 'stable';
        v_pressure_border := null;
        v_event := 'demotion_confirmed';
        v_status := 'Demotion confirmed';
        v_next := 'One win in this track repairs to normal badge.';
      end if;
    end if;
  end if;

  if v_border_before is not null then
    v_danger := v_border_before - 25;
    v_entered_danger :=
      p_rating_after <= v_danger
      and p_rating_before > v_danger;
    if v_entered_danger and v_pressure is distinct from 'demotion_armed' then
      v_pressure := 'demotion_armed';
      v_pressure_border := v_border_before;
      if v_event = 'none' then
        v_event := 'demotion_armed';
        v_status := 'Demotion armed';
        v_next := format(
          'Another rating loss while below %s confirms downgrade. Reach %s+ to clear.',
          v_border_before,
          v_border_before
        );
      end if;
    end if;
  end if;

  if v_pressure = 'demotion_armed' and v_pressure_border is not null and v_event = 'none' then
    v_status := 'Demotion armed';
    v_next := format(
      'Another rating loss while below %s confirms downgrade. Reach %s+ to clear.',
      v_pressure_border,
      v_pressure_border
    );
  end if;

  update public.player_badge_state
  set
    settlement_rating = p_rating_after,
    active_rank_band = v_band_after,
    visual_state = v_visual,
    pressure_state = v_pressure,
    pressure_border = v_pressure_border,
    win_streak = v_streak,
    peak_rank_band = case
      when peak_rank_band is null then v_band_after
      when public.badge_band_sort_order(v_band_after) > public.badge_band_sort_order(peak_rank_band) then v_band_after
      else peak_rank_band
    end,
    last_game_id = p_game_id,
    updated_at = now()
  where user_id = p_user_id and track_key = p_track_key;

  return jsonb_build_object(
    'user_id', p_user_id,
    'track_key', p_track_key,
    'rating_before', p_rating_before,
    'rating_after', p_rating_after,
    'rating_delta', p_delta,
    'active_rank_band', v_band_after,
    'visual_state', v_visual,
    'pressure_state', v_pressure,
    'pressure_border', v_pressure_border,
    'danger_threshold', case
      when v_pressure_border is not null then v_pressure_border - 25
      when v_border_before is not null then v_border_before - 25
      else null
    end,
    'recovery_border', v_pressure_border,
    'win_streak', v_streak,
    'status_label', v_status,
    'next_step_text', v_next,
    'event_type', v_event
  );
end;
$$;

revoke all on function public.settle_player_badge_state(uuid, text, int, int, int, uuid) from public;
grant execute on function public.settle_player_badge_state(uuid, text, int, int, int, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Apply badge settlement for both players on a finished free-play rated game
-- ---------------------------------------------------------------------------
create or replace function public.apply_free_play_badge_settlement(
  p_game_id uuid,
  p_rating_snapshot jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.games%rowtype;
  v_track text;
  v_white jsonb;
  v_black jsonb;
  v_w_before int;
  v_w_after int;
  v_w_delta int;
  v_b_before int;
  v_b_after int;
  v_b_delta int;
  v_w_badge_before int;
  v_b_badge_before int;
begin
  select * into r from public.games where id = p_game_id;
  if not found then
    return jsonb_build_object('applied', false, 'reason', 'game_not_found');
  end if;

  if lower(trim(coalesce(r.play_context, 'free'))) <> 'free' then
    return jsonb_build_object('applied', false, 'reason', 'not_free_play');
  end if;

  if r.rated is not true then
    return jsonb_build_object('applied', false, 'reason', 'unrated');
  end if;

  v_track := public.classify_free_badge_track_key(r.tempo, r.live_time_control);
  if v_track is null then
    return jsonb_build_object('applied', false, 'reason', 'unsupported_track');
  end if;

  v_w_before := coalesce((p_rating_snapshot #>> '{p1_white,before}')::int, (p_rating_snapshot #>> '{white,before}')::int);
  v_w_after := coalesce((p_rating_snapshot #>> '{p1_white,after}')::int, (p_rating_snapshot #>> '{white,after}')::int);
  v_w_delta := coalesce((p_rating_snapshot #>> '{p1_white,delta}')::int, 0);
  v_b_before := coalesce((p_rating_snapshot #>> '{p1_black,before}')::int, (p_rating_snapshot #>> '{black,before}')::int);
  v_b_after := coalesce((p_rating_snapshot #>> '{p1_black,after}')::int, (p_rating_snapshot #>> '{black,after}')::int);
  v_b_delta := coalesce((p_rating_snapshot #>> '{p1_black,delta}')::int, 0);

  select settlement_rating into v_w_badge_before
  from public.player_badge_state
  where user_id = r.white_player_id and track_key = v_track;
  if not found then
    v_w_badge_before := 1500;
  end if;

  select settlement_rating into v_b_badge_before
  from public.player_badge_state
  where user_id = r.black_player_id and track_key = v_track;
  if not found then
    v_b_badge_before := 1500;
  end if;

  v_white := public.settle_player_badge_state(
    r.white_player_id,
    v_track,
    v_w_badge_before,
    v_w_badge_before + v_w_delta,
    v_w_delta,
    p_game_id
  );

  v_black := public.settle_player_badge_state(
    r.black_player_id,
    v_track,
    v_b_badge_before,
    v_b_badge_before + v_b_delta,
    v_b_delta,
    p_game_id
  );

  return jsonb_build_object(
    'applied', true,
    'track_key', v_track,
    'white', v_white,
    'black', v_black
  );
end;
$$;

comment on function public.apply_free_play_badge_settlement(uuid, jsonb) is
  'Phase 1 free-play badge settlement; uses per-track settlement_rating, not tournament_unified.';

revoke all on function public.apply_free_play_badge_settlement(uuid, jsonb) from public;
grant execute on function public.apply_free_play_badge_settlement(uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Hook: extend rating apply to merge badge payload (free play only)
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
  'Dual-write rating apply; free-play merges badge settlement into rating_last_update.badge.';
