-- Async matchmaking fix:
-- - Keep strict busy enforcement for LIVE joins/inserts.
-- - For DAILY/CORRESPONDENCE joins/inserts, allow multiple concurrent games.
-- - Only block async duplicate pair rows (same opponent + same paced tempo + same LTC token).

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
  v_open_paced text;
  v_new_paced text;
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
    v_new_paced := lower(btrim(coalesce(v_tempo, '')));

    if v_new_paced = 'live' then
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
    else
      if exists (
        select 1
        from public.games x
        where x.play_context = 'free'
          and x.tournament_id is null
          and x.status in ('active', 'waiting')
          and x.white_player_id is not null
          and x.black_player_id is not null
          and (
            (x.white_player_id = v_white and x.black_player_id = v_black)
            or (x.white_player_id = v_black and x.black_player_id = v_white)
          )
          and lower(btrim(coalesce(x.tempo, ''))) = v_new_paced
          and lower(btrim(coalesce(x.live_time_control, ''))) = lower(btrim(coalesce(v_ltc, '')))
      ) then
        raise exception 'free_play_async_duplicate_pair';
      end if;
    end if;

    insert into public.games (
      white_player_id,
      black_player_id,
      fen,
      status,
      tempo,
      live_time_control,
      rated,
      play_context,
      source_type,
      source_request_id,
      source_game_id
    )
    values (
      v_white,
      v_black,
      v_fen,
      'active',
      v_tempo,
      v_ltc,
      v_rated,
      'free',
      v_src_type,
      v_src_req,
      v_src_game
    )
    returning * into g;

    if v_new_paced = 'live' then
      perform public.supersede_stale_free_open_seats_for_users(
        array[v_white, v_black],
        g.id,
        coalesce(v_src_req, '00000000-0000-0000-0000-000000000000'::uuid)
      );
    end if;

    return g;
  end if;

  select *
  into open_row
  from public.games gg
  where gg.id = existing_open_seat_id
    and gg.status = 'active'
    and gg.black_player_id is null
    and gg.play_context = 'free'
    and gg.tournament_id is null
  for update;

  if not found then
    raise exception 'open seat not found';
  end if;

  if open_row.white_player_id = v_uid then
    raise exception 'cannot accept your own open seat';
  end if;

  if (payload ? 'black_player_id')
     and nullif(trim(coalesce(payload->>'black_player_id', '')), '') is not null
     and (payload->>'black_player_id')::uuid is distinct from v_uid then
    raise exception 'payload black_player_id must equal auth.uid()';
  end if;

  v_open_paced := lower(btrim(coalesce(open_row.tempo, '')));
  if v_open_paced = 'live' then
    if exists (
      select 1
      from public.games x
      where x.play_context = 'free'
        and x.tournament_id is null
        and x.status in ('active', 'waiting')
        and x.white_player_id is not null
        and x.black_player_id is not null
        and (x.white_player_id = v_uid or x.black_player_id = v_uid)
    ) then
      raise exception 'free_play_joiner_busy';
    end if;
  else
    if exists (
      select 1
      from public.games x
      where x.id <> open_row.id
        and x.play_context = 'free'
        and x.tournament_id is null
        and x.status in ('active', 'waiting')
        and x.white_player_id is not null
        and x.black_player_id is not null
        and (
          (x.white_player_id = open_row.white_player_id and x.black_player_id = v_uid)
          or (x.white_player_id = v_uid and x.black_player_id = open_row.white_player_id)
        )
        and lower(btrim(coalesce(x.tempo, ''))) = v_open_paced
        and lower(btrim(coalesce(x.live_time_control, ''))) = lower(btrim(coalesce(open_row.live_time_control, '')))
    ) then
      raise exception 'free_play_async_duplicate_pair';
    end if;
  end if;

  update public.games gg
  set
    black_player_id = v_uid,
    status = 'active',
    started_at = coalesce(gg.started_at, now()),
    updated_at = now()
  where gg.id = open_row.id
    and gg.black_player_id is null
    and gg.status = 'active'
  returning * into g;

  if not found then
    raise exception 'seat already taken';
  end if;

  if v_open_paced = 'live' then
    perform public.supersede_stale_free_open_seats_for_users(
      array[g.white_player_id, v_uid],
      g.id,
      coalesce(g.source_request_id, '00000000-0000-0000-0000-000000000000'::uuid)
    );
  end if;

  return g;
end;
$$;
