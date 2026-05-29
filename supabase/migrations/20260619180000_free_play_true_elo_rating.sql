-- Free-play TRUE ELO rating movement (first correction; replaces hardcoded +/-10).
-- Mirrors lib/eloRating.ts. Official rating movement = standard Elo expected-score only:
--   ExpectedScoreA = 1 / (1 + 10 ^ ((RatingB - RatingA) / 400))
--   DeltaA         = round(K * (ScoreA - ExpectedScoreA))   [round = half away from zero, numeric]
--
-- SCOPE: FREE-PLAY ONLY. Tournament (ctx='tournament') keeps prior fixed +/-10 settlement
-- until tournament bracket/event-decision timing is resolved. No badge logic change.
-- Preserves: guards, [100,4000] clamps, badge snapshot order, ledger append order,
-- rating_applied idempotency, legacy + P1 dual write. STARTING_RATING stays 1500.
-- No backfill: historical +/-10 rows remain as v1 history.

-- ---------------------------------------------------------------------------
-- Ledger append (faithful reproduction of 20260619160000 + elo audit metadata
-- merged into the mode-scope row from snapshot side.elo_meta when present).
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
-- Standard Elo expected score (numeric, denominator 400). Mirrors lib/eloRating.ts.
-- ---------------------------------------------------------------------------
create or replace function public.elo_expected_score(p_rating_self int, p_rating_opp int)
returns numeric
language sql
immutable
as $$
  select 1.0 / (1.0 + power(10.0::numeric, ((p_rating_opp - p_rating_self)::numeric / 400.0)));
$$;

comment on function public.elo_expected_score(int, int) is
  'Standard Elo expected score for self vs opponent; denominator 400. Mirrors lib/eloRating.ts.';

-- ---------------------------------------------------------------------------
-- K-factor schedule (calibration only): <8 → 40, 8..25 → 32, >=26 → 20.
-- ---------------------------------------------------------------------------
create or replace function public.elo_k_factor_for_games_played(p_games_played int)
returns int
language sql
immutable
as $$
  select case
    when coalesce(p_games_played, 0) < 8 then 40
    when coalesce(p_games_played, 0) < 26 then 32
    else 20
  end;
$$;

comment on function public.elo_k_factor_for_games_played(int) is
  'ACCL MVP K-factor schedule (very new / provisional / established). No streak/style/AI K.';

-- ---------------------------------------------------------------------------
-- Free-play rating apply: TRUE ELO for free; tournament keeps prior +/-10.
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
  -- True Elo working state (free-play only)
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

  -- Canonical game scores (win=1, draw=0.5, loss=0). Reject unknown result.
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
    -- TRUE ELO. Canonical rating/K source = P1 bucket. Same delta applied to legacy
    -- for dual-write continuity.
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
    -- TOURNAMENT: preserve prior fixed +/-10 (timing unresolved; do not change here).
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

  -- Audit metadata (carried into ledger mode-row metadata via snapshot side.elo_meta).
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
  'Dual-write rating apply; free-play uses TRUE ELO (denominator 400, K 40/32/20), tournament keeps fixed +/-10 pending bracket settlement. Badge + ledger append preserved.';

-- Spot checks (run in SQL editor after apply):
--   select public.elo_expected_score(1500, 1500);            -- 0.5
--   select public.elo_expected_score(1600, 1200);            -- ~0.909
--   select round(20 * (1 - public.elo_expected_score(1500,1500)))::int;  -- 10
--   select public.elo_k_factor_for_games_played(7);          -- 40
--   select public.elo_k_factor_for_games_played(8);          -- 32
--   select public.elo_k_factor_for_games_played(26);         -- 20
