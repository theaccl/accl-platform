-- =============================================================================
-- PROVENANCE ONLY — apply_free_play_rating_update_core return-path restoration
-- =============================================================================
--
-- Migration id: 20260522180000_provenance_apply_free_play_rating_update_core_return_path
-- Operator script (manual apply artifact): supabase/scripts/hotfix_20260522_apply_free_play_rating_update_core_return.sql
-- Canonical function body source: supabase/migrations/20260519200000_tournament_zero_move_rating_void.sql
--
-- PRODUCTION STATUS (record, not instruction to auto-apply):
--   Applied manually in Supabase SQL Editor on 2026-05-22, before this repo file
--   existed. Production DB already matches the CREATE OR REPLACE below.
--
-- PURPOSE:
--   Align Git migration history with production DB truth after an out-of-band hotfix.
--   No rating redesign. No app deploy. Idempotent: safe to re-run CREATE OR REPLACE.
--
-- DO NOT MOVE TAGS:
--   alpha-stage0-20260521          → 7c655fe  (Stage 0 alpha freeze)
--   alpha-stage0-patch1-20260522   → 8936377  (board stability patch only)
--
-- ROOT CAUSE (production drift):
--   public.apply_free_play_rating_update_core was truncated / missing return paths
--   for games with move logs (body after move_count guard fell through without RETURN).
--   Trigger games_apply_free_rating_after_finish calls this function on every
--   games.status → finished transition.
--
-- OBSERVED ERROR:
--   control reached end of function without RETURN
--
-- SYMPTOMS FIXED (verified post-hotfix):
--   • finish_game_system / finish_game timeout finish rolled back → stale active games
--   • apply_bot_game_turn_system terminal checkmate rolled back → move_commit_failed
--   • Clock UI at 0:00 with game still active; resign/timeout RPC failures
--   • Play Computer checkmate could not reach Game Over until hotfix applied
--
-- BEHAVIOR:
--   Identical to 20260519200000 — restores full function including:
--   • zero_move_void (0 move logs)
--   • lifecycle_void_finish (superseded, expired_open_seat, abandoned_before_move, no_first_move)
--   • unrated / not_finished / already_applied early returns
--   • existing dual-write rating apply for rated finished games (unchanged)
--
-- REVIEW / APPLY POLICY:
--   • This file is for repo provenance and reviewer diff — NOT auto-applied by CI.
--   • Do not push to main unless explicitly approved.
--   • Fresh environments: apply after 20260519200000 (same body; this documents prod hotfix).
--
-- ROLLBACK (only if hotfix causes unexpected regression):
--   Capture before any change:
--     select pg_get_functiondef(p.oid)
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public'
--       and p.proname = 'apply_free_play_rating_update_core'
--       and pg_get_function_identity_arguments(p.oid) = 'p_game_id uuid';
--   Do NOT restore the truncated pre-hotfix body.
--
-- =============================================================================
-- VERIFICATION NOTES (run manually after apply or to confirm prod alignment)
-- =============================================================================
--
-- V1) Finished game with move logs — must return jsonb, not Postgres error:
--
--   select g.id
--   from public.games g
--   where g.status = 'finished'
--     and exists (select 1 from public.game_move_logs m where m.game_id = g.id limit 1)
--   order by g.finished_at desc nulls last
--   limit 1;
--
--   select public.apply_free_play_rating_update_core('<game_id>'::uuid);
--
--   Expected (unrated bot example):
--     {"applied": false, "reason": "unrated", "bucket": null}
--   Fail if:
--     ERROR: control reached end of function without RETURN
--
-- V2) Timeout finish on a stale active game (service role / finish_game_system):
--
--   select public.finish_game_system('<active_game_id>'::uuid, 'black_win', 'timeout');
--
--   Expected: returns games row with status = finished, end_reason = timeout
--
-- V3) Play Computer checkmate (UI on play.theaccl.com):
--   Deliver legal mate → Game Over, white_win/checkmate, no move_commit_failed
--
-- =============================================================================

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
  'Dual-write rating apply; skips 0-move finishes and abandoned_before_move / no_first_move end reasons. Provenance hotfix 20260522180000 restores full return paths (prod applied 2026-05-22).';
