-- Join as Black on a free open seat: void the joiner's (and host's) other open seats **before**
-- the `free_play_joiner_busy` check. Previously `joiner_busy` matched the joiner's own waiting row
-- (white with black null) and raised before supersede ran, so void-then-join could never succeed.
-- Also cancel the joiner's pending open **live** `match_requests` listings (mirrors
-- `invalidateLiveQueueAvailabilityForUsers` for `games` supersede).

create or replace function public.create_seated_game_guard(
  existing_open_seat_id uuid,
  payload jsonb
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

  if existing_open_seat_id is null then
    v_white := (payload->>'white_player_id')::uuid;
    v_black := (payload->>'black_player_id')::uuid;
    if v_white is null or v_black is null or v_white = v_black then
      raise exception 'invalid seated players';
    end if;
    if v_uid is distinct from v_white and v_uid is distinct from v_black then
      raise exception 'not a participant';
    end if;

    if exists (
      select 1
      from public.games x
      where x.play_context = 'free'
        and x.tournament_id is null
        and x.status in ('active', 'waiting')
        and x.white_player_id is not null
        and x.black_player_id is not null
        and (x.white_player_id = v_white or x.black_player_id = v_white)
    ) then
      raise exception 'free_play_player_already_seated';
    end if;

    if exists (
      select 1
      from public.games x
      where x.play_context = 'free'
        and x.tournament_id is null
        and x.status in ('active', 'waiting')
        and x.white_player_id is not null
        and x.black_player_id is not null
        and (x.white_player_id = v_black or x.black_player_id = v_black)
    ) then
      raise exception 'free_play_player_already_seated';
    end if;

    perform public.supersede_stale_free_open_seats_for_users(v_white, v_black, null);

    v_fen := nullif(trim(coalesce(payload->>'fen', '')), '');
    if v_fen is null then
      v_fen := 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    end if;
    v_tempo := coalesce(nullif(trim(payload->>'tempo'), ''), 'live');
    v_ltc := nullif(trim(payload->>'live_time_control'), '');
    v_rated := coalesce((payload->>'rated')::boolean, false);
    v_src_type := nullif(trim(payload->>'source_type'), '');
    v_src_req := (payload->>'source_request_id')::uuid;
    v_src_game := (payload->>'source_game_id')::uuid;

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
      black_clock_ms,
      end_reason
    )
    values (
      v_white,
      v_black,
      'active',
      v_fen,
      coalesce(nullif(trim(payload->>'turn'), ''), 'white'),
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
      null,
      null
    )
    returning * into g;

    return g;
  end if;

  select * into open_row
  from public.games
  where id = existing_open_seat_id
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
  v_black := (payload->>'black_player_id')::uuid;
  if v_black is null or v_white is null or v_white = v_black then
    raise exception 'invalid black player';
  end if;
  if v_uid is distinct from v_black then
    raise exception 'only joining player may seat black';
  end if;

  perform public.supersede_stale_free_open_seats_for_users(v_white, v_black, open_row.id);

  update public.match_requests mr
  set status = 'cancelled',
      responded_at = now()
  where mr.status = 'pending'
    and mr.visibility = 'open'
    and mr.tempo = 'live'
    and mr.from_user_id = v_black;

  if exists (
    select 1
    from public.games x
    where x.play_context = 'free'
      and x.tournament_id is null
      and x.status in ('active', 'waiting')
      and (x.white_player_id = v_black or x.black_player_id = v_black)
  ) then
    raise exception 'free_play_joiner_busy';
  end if;

  if exists (
    select 1
    from public.games x
    where x.play_context = 'free'
      and x.tournament_id is null
      and x.status in ('active', 'waiting')
      and x.id is distinct from open_row.id
      and x.white_player_id is not null
      and x.black_player_id is not null
      and (x.white_player_id = v_white or x.black_player_id = v_white)
  ) then
    raise exception 'free_play_host_busy';
  end if;

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
  'Free-play: server-side busy checks (not RLS-dependent), supersede stale open seats before joiner_busy, then seat black.';
