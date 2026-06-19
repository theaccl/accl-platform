-- O2 — free-play ACCL Overall atomic dual-write + ACCL ledger rows (Stage 1 post-O1).
-- ACCL_O2_FREE_PLAY_ATOMIC_DUAL_WRITE
--
-- In scope:
--   - bucket-specific accl_overall uncap (U1 partial)
--   - independent ACCL Overall Elo write on free-play apply (v3_accl_overall_elo)
--   - additive accl / overall / global ledger rows (free-play only)
--
-- Out of scope:
--   - tournament ACCL writes, badge activation, O3 backfill, trigger changes

-- ---------------------------------------------------------------------------
-- 1) player_ratings rating constraint — accl_overall uncapped; others capped
-- ---------------------------------------------------------------------------

alter table public.player_ratings
  drop constraint if exists player_ratings_rating_reasonable;

alter table public.player_ratings
  add constraint player_ratings_rating_reasonable check (
    rating >= 100
    and (
      bucket = 'accl_overall'
      or rating <= 4000
    )
  );

-- ---------------------------------------------------------------------------
-- 2) Ledger insert helper — same 22-parameter signature; scoped model column
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
    case
      when p_rating_track_id = 'accl'
       and p_rating_scope = 'overall'
      then 'v3_accl_overall_elo'
      else 'v1'
    end,
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
-- 3) Ledger append — preserve mode/exact paths; add free-play ACCL rows
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
            || coalesce(v_side->'elo_meta', '{}'::jsonb)
        );
        v_ins := v_ins + 1;
      else
        v_skip := v_skip + 1;
      end if;
    else
      v_skip := v_skip + 1;
    end if;

    if v_ctx = 'free' then
      v_side := case
        when v_uid = g.white_player_id then p_rating_snapshot->'accl_white'
        else p_rating_snapshot->'accl_black'
      end;

      if v_side is not null
         and (v_side->>'before') is not null
         and (v_side->>'after') is not null then
        perform public.rating_history_ledger_insert_row(
          v_uid,
          'accl',
          'global',
          'overall',
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
          jsonb_build_object('rating_model_version', 'v3_accl_overall_elo')
            || coalesce(v_side->'elo_meta', '{}'::jsonb)
        );
        v_ins := v_ins + 1;
      else
        v_skip := v_skip + 1;
      end if;
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
-- 4) Apply core — free-play ACCL Overall dual-write; tournament unchanged
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
  w_before_accl int;
  b_before_accl int;
  w_after_accl int;
  b_after_accl int;
  w_gp_accl int;
  b_gp_accl int;
  w_k_accl int;
  b_k_accl int;
  w_e_accl numeric;
  b_e_accl numeric;
  w_delta_accl_raw int;
  b_delta_accl_raw int;
  w_delta_accl int;
  b_delta_accl int;
  ctx text;
  out jsonb;
  v_games_updated int;
  v_move_count int;
  v_badge jsonb;
  v_ledger jsonb;
  w_score numeric;
  b_score numeric;
  w_k int;
  b_k int;
  w_e numeric;
  b_e numeric;
  w_delta_raw int;
  b_delta_raw int;
  v_model text;
  v_elo_w jsonb := '{}'::jsonb;
  v_elo_b jsonb := '{}'::jsonb;
  v_elo_accl_w jsonb := '{}'::jsonb;
  v_elo_accl_b jsonb := '{}'::jsonb;
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
    w_score := 0.5;
    b_score := 0.5;
  elsif r.result = 'white_win' or r.winner_id = r.white_player_id then
    w_score := 1;
    b_score := 0;
  elsif r.result = 'black_win' or r.winner_id = r.black_player_id then
    w_score := 0;
    b_score := 1;
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

  if ctx = 'free' then
    v_model := 'v2_elo_free';
    w_k := public.elo_k_factor_for_games_played(w_gp_p);
    b_k := public.elo_k_factor_for_games_played(b_gp_p);
    w_e := public.elo_expected_score(w_before_p, b_before_p);
    b_e := public.elo_expected_score(b_before_p, w_before_p);
    w_delta_raw := round(w_k * (w_score - w_e))::int;
    b_delta_raw := round(b_k * (b_score - b_e))::int;
    w_delta := w_delta_raw;
    b_delta := b_delta_raw;
  else
    v_model := 'v1_fixed_tournament';
    if w_score = 0.5 then
      w_delta := 0;
      b_delta := 0;
    elsif w_score = 1 then
      w_delta := 10;
      b_delta := -10;
    else
      w_delta := -10;
      b_delta := 10;
    end if;
    w_delta_raw := w_delta;
    b_delta_raw := b_delta;
  end if;

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

  if ctx = 'free' then
    insert into public.player_ratings (user_id, bucket, rating, games_played)
    values (r.white_player_id, 'accl_overall', 1500, 0)
    on conflict (user_id, bucket) do nothing;
    insert into public.player_ratings (user_id, bucket, rating, games_played)
    values (r.black_player_id, 'accl_overall', 1500, 0)
    on conflict (user_id, bucket) do nothing;

    select rating, games_played into strict w_before_accl, w_gp_accl
    from public.player_ratings
    where user_id = r.white_player_id and bucket = 'accl_overall'
    for update;
    select rating, games_played into strict b_before_accl, b_gp_accl
    from public.player_ratings
    where user_id = r.black_player_id and bucket = 'accl_overall'
    for update;

    w_k_accl := public.elo_k_factor_for_games_played(w_gp_accl);
    b_k_accl := public.elo_k_factor_for_games_played(b_gp_accl);
    w_e_accl := public.elo_expected_score(w_before_accl, b_before_accl);
    b_e_accl := public.elo_expected_score(b_before_accl, w_before_accl);
    w_delta_accl_raw := round(w_k_accl * (w_score - w_e_accl))::int;
    b_delta_accl_raw := round(b_k_accl * (b_score - b_e_accl))::int;
    w_delta_accl := w_delta_accl_raw;
    b_delta_accl := b_delta_accl_raw;
    w_after_accl := greatest(100, w_before_accl + w_delta_accl);
    b_after_accl := greatest(100, b_before_accl + b_delta_accl);

    update public.player_ratings
    set
      rating = w_after_accl,
      games_played = games_played + 1,
      updated_at = now()
    where user_id = r.white_player_id and bucket = 'accl_overall';

    get diagnostics v_games_updated = row_count;
    if v_games_updated <> 1 then
      raise exception 'apply_free_play_rating_update_core: accl_overall white update expected 1 row, got %', v_games_updated;
    end if;

    update public.player_ratings
    set
      rating = b_after_accl,
      games_played = games_played + 1,
      updated_at = now()
    where user_id = r.black_player_id and bucket = 'accl_overall';

    get diagnostics v_games_updated = row_count;
    if v_games_updated <> 1 then
      raise exception 'apply_free_play_rating_update_core: accl_overall black update expected 1 row, got %', v_games_updated;
    end if;

    v_elo_accl_w := jsonb_build_object(
      'rating_model_version', 'v3_accl_overall_elo',
      'e_score', round(w_e_accl, 6),
      'k_factor_applied', w_k_accl,
      'delta_raw', w_delta_accl_raw,
      'delta_clamped', w_after_accl - w_before_accl
    );
    v_elo_accl_b := jsonb_build_object(
      'rating_model_version', 'v3_accl_overall_elo',
      'e_score', round(b_e_accl, 6),
      'k_factor_applied', b_k_accl,
      'delta_raw', b_delta_accl_raw,
      'delta_clamped', b_after_accl - b_before_accl
    );
  end if;

  v_elo_w := jsonb_build_object(
    'rating_model_version', v_model,
    'e_score', round(w_e, 6),
    'k_factor_applied', w_k,
    'delta_raw', w_delta_raw,
    'delta_clamped', w_after_p - w_before_p
  );
  v_elo_b := jsonb_build_object(
    'rating_model_version', v_model,
    'e_score', round(b_e, 6),
    'k_factor_applied', b_k,
    'delta_raw', b_delta_raw,
    'delta_clamped', b_after_p - b_before_p
  );

  out := jsonb_build_object(
    'applied', true,
    'reason', 'ok',
    'bucket', v_legacy,
    'p1_bucket', v_p1,
    'play_context', ctx,
    'rating_model_version', v_model,
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
      'games_played_after', w_gp_p + 1,
      'elo_meta', v_elo_w
    ),
    'p1_black', jsonb_build_object(
      'user_id', r.black_player_id,
      'before', b_before_p,
      'after', b_after_p,
      'delta', b_delta,
      'games_played_before', b_gp_p,
      'games_played_after', b_gp_p + 1,
      'elo_meta', v_elo_b
    )
  );

  if ctx = 'free' then
    out := out || jsonb_build_object(
      'accl_white', jsonb_build_object(
        'user_id', r.white_player_id,
        'before', w_before_accl,
        'after', w_after_accl,
        'delta', w_delta_accl,
        'games_played_before', w_gp_accl,
        'games_played_after', w_gp_accl + 1,
        'elo_meta', v_elo_accl_w
      ),
      'accl_black', jsonb_build_object(
        'user_id', r.black_player_id,
        'before', b_before_accl,
        'after', b_after_accl,
        'delta', b_delta_accl,
        'games_played_before', b_gp_accl,
        'games_played_after', b_gp_accl + 1,
        'elo_meta', v_elo_accl_b
      )
    );
  end if;

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
  'Dual-write rating apply; free-play TRUE ELO mode buckets + independent ACCL Overall (v3_accl_overall_elo); tournament fixed +/-10. Badge + ledger append preserved.';

-- ---------------------------------------------------------------------------
-- 5) O2 post-check — fail closed on missing markers and forbidden writes
-- ---------------------------------------------------------------------------

do $$
declare
  v_core_def text;
  v_append_def text;
  v_insert_def text;
  v_constraint_def text;
begin
  select pg_get_constraintdef(oid)
    into v_constraint_def
  from pg_constraint
  where conname = 'player_ratings_rating_reasonable'
    and conrelid = 'public.player_ratings'::regclass;

  if v_constraint_def is null then
    raise exception 'O2 post-check failed: player_ratings_rating_reasonable missing';
  end if;

  if position('accl_overall' in v_constraint_def) = 0 then
    raise exception 'O2 post-check failed: player_ratings_rating_reasonable missing accl_overall exception';
  end if;

  select pg_get_functiondef('public.rating_history_ledger_insert_row(uuid,text,text,text,text,text,text,text,uuid,uuid,text,integer,integer,integer,timestamp with time zone,text,text,text,integer,integer,boolean,jsonb)'::regprocedure)
    into v_insert_def;

  if position('v3_accl_overall_elo' in v_insert_def) = 0 then
    raise exception 'O2 post-check failed: rating_history_ledger_insert_row missing v3_accl_overall_elo column CASE';
  end if;

  select pg_get_functiondef('public.append_rating_history_ledger_for_game_apply(uuid,jsonb,jsonb)'::regprocedure)
    into v_append_def;

  if position('''accl''' in v_append_def) = 0
     or position('''global''' in v_append_def) = 0
     or position('''overall''' in v_append_def) = 0 then
    raise exception 'O2 post-check failed: append_rating_history_ledger_for_game_apply missing ACCL row shape';
  end if;

  select pg_get_functiondef('public.apply_free_play_rating_update_core(uuid)'::regprocedure)
    into v_core_def;

  if position('v3_accl_overall_elo' in v_core_def) = 0 then
    raise exception 'O2 post-check failed: apply_free_play_rating_update_core missing v3_accl_overall_elo marker';
  end if;

  if position('v2_elo_free' in lower(v_core_def)) = 0 then
    raise exception 'O2 post-check failed: apply_free_play_rating_update_core missing v2_elo_free marker';
  end if;

  if position('bucket = ''accl_overall''' in v_core_def) = 0 then
    raise exception 'O2 post-check failed: apply_free_play_rating_update_core missing accl_overall bucket write';
  end if;

  if position('insert into public.player_badge_state' in lower(v_core_def)) > 0 then
    raise exception 'O2 post-check failed: apply_free_play_rating_update_core must not write player_badge_state';
  end if;

  if position('trg_games_apply_free_rating_after_finish' in v_core_def) > 0 then
    raise exception 'O2 post-check failed: apply core must not replace finish trigger';
  end if;
end;
$$;
