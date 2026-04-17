-- P1 dual-write (T5–T7): legacy six-bucket + P1 buckets in one transaction.
-- AC: no partial writes; rating_applied only after legacy + P1 updates both succeed;
--     tournament applies when classification valid (no tournament_deferred);
--     only target bucket rows per player are updated (others unchanged).

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
begin
  select * into r from public.games where id = p_game_id for update;
  if not found then
    return jsonb_build_object('applied', false, 'reason', 'game_not_found');
  end if;

  if r.status <> 'finished' then
    return jsonb_build_object('applied', false, 'reason', 'not_finished');
  end if;

  if lower(trim(coalesce(r.end_reason, ''))) in ('superseded', 'expired_open_seat') then
    return jsonb_build_object(
      'applied', false,
      'reason', 'lifecycle_void_finish',
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
  'Dual-write: legacy classify_rating_bucket + P1 classify_p1_rating_bucket in one transaction; rating_applied after both paths. Tournament finishes update legacy tournament_* pace + tournament_unified.';
