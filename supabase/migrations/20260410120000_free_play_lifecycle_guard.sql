-- Phase 1: free-play lifecycle — one seated active per user (supersede), stale open-seat expiry (cron).
-- Does not alter tournament/correspondence rules. No row deletes.

-- ---------------------------------------------------------------------------
-- Rating: void finishes (no Elo / games_played bump)
-- ---------------------------------------------------------------------------

create or replace function public.apply_free_play_rating_update_core(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.games%rowtype;
  v_bucket text;
  w_before int;
  b_before int;
  w_delta int := 0;
  b_delta int := 0;
  w_after int;
  b_after int;
  w_gp int;
  b_gp int;
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
  if ctx = 'tournament' then
    return jsonb_build_object(
      'applied', false,
      'reason', 'tournament_deferred',
      'bucket', null
    );
  end if;
  if ctx <> 'free' then
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

  v_bucket := public.classify_rating_bucket(
    coalesce(r.play_context, 'free'),
    r.tempo,
    r.live_time_control
  );

  if v_bucket is null then
    return jsonb_build_object(
      'applied', false,
      'reason', 'invalid_time_control',
      'bucket', null
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
      'bucket', v_bucket
    );
  end if;

  insert into public.player_ratings (user_id, bucket, rating, games_played)
  values (r.white_player_id, v_bucket, 1500, 0)
  on conflict (user_id, bucket) do nothing;
  insert into public.player_ratings (user_id, bucket, rating, games_played)
  values (r.black_player_id, v_bucket, 1500, 0)
  on conflict (user_id, bucket) do nothing;

  select rating, games_played into w_before, w_gp
  from public.player_ratings
  where user_id = r.white_player_id and bucket = v_bucket
  for update;
  select rating, games_played into b_before, b_gp
  from public.player_ratings
  where user_id = r.black_player_id and bucket = v_bucket
  for update;

  w_after := greatest(100, least(4000, w_before + w_delta));
  b_after := greatest(100, least(4000, b_before + b_delta));

  update public.player_ratings
  set
    rating = w_after,
    games_played = games_played + 1,
    updated_at = now()
  where user_id = r.white_player_id and bucket = v_bucket;

  update public.player_ratings
  set
    rating = b_after,
    games_played = games_played + 1,
    updated_at = now()
  where user_id = r.black_player_id and bucket = v_bucket;

  out := jsonb_build_object(
    'applied', true,
    'reason', 'ok',
    'bucket', v_bucket,
    'white', jsonb_build_object(
      'user_id', r.white_player_id,
      'before', w_before,
      'after', w_after,
      'delta', w_delta,
      'games_played_before', w_gp,
      'games_played_after', w_gp + 1
    ),
    'black', jsonb_build_object(
      'user_id', r.black_player_id,
      'before', b_before,
      'after', b_after,
      'delta', b_delta,
      'games_played_before', b_gp,
      'games_played_after', b_gp + 1
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

-- ---------------------------------------------------------------------------
-- finish_game (client) + finish_game_system (RPC internals / cron)
-- ---------------------------------------------------------------------------

create or replace function public.finish_game_core(
  p_game_id uuid,
  p_result text,
  p_end_reason text,
  p_actor uuid
)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games%rowtype;
  v_winner uuid;
  v_result text;
  v_uid uuid;
begin
  select * into g from public.games where id = p_game_id for update;
  if not found then
    raise exception 'game not found';
  end if;

  if g.status = 'finished' then
    return g;
  end if;

  if g.status is distinct from 'active' and g.status is distinct from 'waiting' then
    raise exception 'game not finishable';
  end if;

  v_uid := p_actor;
  if v_uid is not null then
    if v_uid is distinct from g.white_player_id
       and (g.black_player_id is null or v_uid is distinct from g.black_player_id) then
      raise exception 'not authorized';
    end if;
  end if;

  v_result := lower(trim(coalesce(p_result, '')));
  if v_result = '1/2-1/2' then
    v_result := 'draw';
  end if;

  if v_result = 'draw' then
    v_winner := null;
  elsif v_result = 'white_win' then
    v_winner := g.white_player_id;
  elsif v_result = 'black_win' then
    v_winner := g.black_player_id;
  else
    raise exception 'invalid result %', p_result;
  end if;

  update public.games
  set
    status = 'finished',
    result = v_result,
    winner_id = v_winner,
    end_reason = p_end_reason,
    finished_at = now(),
    draw_offered_by = null,
    draw_offered_at = null
  where id = p_game_id
  returning * into g;

  return g;
end;
$$;

create or replace function public.finish_game(
  p_game_id uuid,
  p_result text,
  p_end_reason text
)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.finish_game_core(p_game_id, p_result, p_end_reason, auth.uid());
end;
$$;

create or replace function public.finish_game_system(
  p_game_id uuid,
  p_result text,
  p_end_reason text
)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.finish_game_core(p_game_id, p_result, p_end_reason, null);
end;
$$;

comment on function public.finish_game_system(uuid, text, text) is
  'SECURITY DEFINER: same transition as finish_game without auth.uid(); for guarded RPCs and cron only.';

revoke all on function public.finish_game_core(uuid, text, text, uuid) from public;
revoke all on function public.finish_game_system(uuid, text, text) from public;

revoke all on function public.finish_game(uuid, text, text) from public;
grant execute on function public.finish_game(uuid, text, text) to authenticated;
grant execute on function public.finish_game_system(uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Supersede other free seated actives for two users (excluding one game id)
-- ---------------------------------------------------------------------------

create or replace function public.supersede_free_seated_games_for_pair(
  p_user_a uuid,
  p_user_b uuid,
  p_exclude_game_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select id
    from public.games
    where status = 'active'
      and play_context = 'free'
      and tournament_id is null
      and black_player_id is not null
      and (
        white_player_id in (p_user_a, p_user_b)
        or black_player_id in (p_user_a, p_user_b)
      )
      and (p_exclude_game_id is null or id is distinct from p_exclude_game_id)
    order by created_at asc
    for update
  loop
    perform public.finish_game_system(r.id, 'draw', 'superseded');
  end loop;
end;
$$;

revoke all on function public.supersede_free_seated_games_for_pair(uuid, uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- create_seated_game_guard: accept-challenge insert OR open-seat join
-- ---------------------------------------------------------------------------

create or replace function public.create_seated_game_guard(
  p_existing_open_seat_id uuid,
  p_row jsonb
)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_white uuid;
  v_black uuid;
  g public.games%rowtype;
  open_row public.games%rowtype;
  v_fen text;
  v_tempo text;
  v_ltc text;
  v_rated boolean;
  v_src_type text;
  v_src_req uuid;
  v_src_game uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_existing_open_seat_id is null then
    v_white := (p_row->>'white_player_id')::uuid;
    v_black := (p_row->>'black_player_id')::uuid;
    if v_white is null or v_black is null or v_white = v_black then
      raise exception 'invalid seated players';
    end if;
    if v_uid is distinct from v_white and v_uid is distinct from v_black then
      raise exception 'not a participant';
    end if;

    perform public.supersede_free_seated_games_for_pair(v_white, v_black, null);

    v_fen := nullif(trim(coalesce(p_row->>'fen', '')), '');
    if v_fen is null then
      v_fen := 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    end if;
    v_tempo := coalesce(nullif(trim(p_row->>'tempo'), ''), 'live');
    v_ltc := nullif(trim(p_row->>'live_time_control'), '');
    v_rated := coalesce((p_row->>'rated')::boolean, false);
    v_src_type := nullif(trim(p_row->>'source_type'), '');
    v_src_req := (p_row->>'source_request_id')::uuid;
    v_src_game := (p_row->>'source_game_id')::uuid;

    insert into public.games (
      white_player_id,
      black_player_id,
      status,
      fen,
      turn,
      play_context,
      tournament_id,
      rated,
      source_type,
      source_request_id,
      source_game_id,
      tempo,
      live_time_control,
      last_move_at,
      move_deadline_at,
      white_clock_ms,
      black_clock_ms
    )
    values (
      v_white,
      v_black,
      'active',
      v_fen,
      coalesce(nullif(trim(p_row->>'turn'), ''), 'white'),
      'free',
      null,
      v_rated,
      v_src_type,
      v_src_req,
      v_src_game,
      v_tempo,
      v_ltc,
      null,
      null,
      null,
      null
    )
    returning * into g;

    return g;
  end if;

  select * into open_row
  from public.games
  where id = p_existing_open_seat_id
  for update;

  if not found then
    raise exception 'open seat not found';
  end if;

  if open_row.status is distinct from 'active' then
    raise exception 'seat not active';
  end if;
  if open_row.play_context is distinct from 'free' or open_row.tournament_id is not null then
    raise exception 'not a free-play open seat';
  end if;
  if open_row.black_player_id is not null then
    raise exception 'seat already taken';
  end if;

  v_white := open_row.white_player_id;
  v_black := (p_row->>'black_player_id')::uuid;
  if v_black is null or v_white is null or v_white = v_black then
    raise exception 'invalid black player';
  end if;
  if v_uid is distinct from v_black then
    raise exception 'only joining player may seat black';
  end if;

  perform public.supersede_free_seated_games_for_pair(v_white, v_black, open_row.id);

  update public.games
  set black_player_id = v_black
  where id = open_row.id
    and black_player_id is null
    and status = 'active'
  returning * into g;

  if not found then
    raise exception 'join failed (race)';
  end if;

  return g;
end;
$$;

comment on function public.create_seated_game_guard(uuid, jsonb) is
  'Transactional: supersede other free seated actives for either player, then insert (p_existing_open_seat_id null) or seat black on an open row.';

revoke all on function public.create_seated_game_guard(uuid, jsonb) from public;
grant execute on function public.create_seated_game_guard(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- expire_open_seats (cron; batch + SKIP LOCKED)
-- ---------------------------------------------------------------------------

create or replace function public.expire_open_seats(p_batch integer default 50)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
  v_batch int := greatest(1, least(coalesce(p_batch, 50), 500));
  r record;
begin
  for r in
    select id
    from public.games
    where status = 'active'
      and play_context = 'free'
      and tournament_id is null
      and black_player_id is null
      and created_at < now() - interval '48 hours'
    order by created_at asc
    limit v_batch
    for update skip locked
  loop
    perform public.finish_game_system(r.id, 'draw', 'expired_open_seat');
    n := n + 1;
  end loop;
  return n;
end;
$$;

comment on function public.expire_open_seats(integer) is
  'Finishes stale free open seats (48h, no black) as draw / expired_open_seat; batch + SKIP LOCKED.';

revoke all on function public.expire_open_seats(integer) from public;
grant execute on function public.expire_open_seats(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists games_free_active_open_seat_expiry_idx
  on public.games (created_at asc)
  where status = 'active'
    and play_context = 'free'
    and tournament_id is null
    and black_player_id is null;

create index if not exists games_free_active_seated_white_idx
  on public.games (white_player_id)
  where status = 'active'
    and play_context = 'free'
    and tournament_id is null
    and black_player_id is not null;

create index if not exists games_free_active_seated_black_idx
  on public.games (black_player_id)
  where status = 'active'
    and play_context = 'free'
    and tournament_id is null
    and black_player_id is not null;

-- Cron / operator (service_role or DB superuser): small batches until returns 0.
--   select public.expire_open_seats(50);
-- Supabase pg_cron example: schedule a job that runs the above SQL as a role with
-- EXECUTE on expire_open_seats (typically service_role via security definer wrapper or postgres).
