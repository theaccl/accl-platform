-- Match integrity: enforce busy-player rules inside create_seated_game_guard (SECURITY DEFINER).
--
-- Client-side filters in runFreePlayFindMatch cannot see other users' full games under RLS
-- (only participant SELECT + open-seat discovery). Player B's queries therefore miss
-- Player A's active seated game, so stale duplicate open seats for A stayed "joinable".
--
-- 1) Before any join/insert: block if joiner or (for open-seat join) host is already in
--    another active/waiting free game in a disallowed way.
-- 2) Replace supersede_free_seated_games_for_pair with open-seat-only cleanup:
--    never call finish_game_system on rows where both players are seated.

-- ---------------------------------------------------------------------------
-- Supersede ONLY duplicate/stale open seats (black null), never two-player games
-- ---------------------------------------------------------------------------

create or replace function public.supersede_stale_free_open_seats_for_users(
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
    where play_context = 'free'
      and tournament_id is null
      and status in ('active', 'waiting')
      and black_player_id is null
      and white_player_id is not null
      and white_player_id in (p_user_a, p_user_b)
      and (p_exclude_game_id is null or id is distinct from p_exclude_game_id)
    order by created_at asc
    for update
  loop
    perform public.finish_game_system(r.id, 'draw', 'superseded');
  end loop;
end;
$$;

revoke all on function public.supersede_stale_free_open_seats_for_users(uuid, uuid, uuid) from public;

-- ---------------------------------------------------------------------------
-- create_seated_game_guard: guards + open-seat-only supersede
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
      black_clock_ms,
      end_reason
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

  perform public.supersede_stale_free_open_seats_for_users(v_white, v_black, open_row.id);

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
  'Free-play: server-side busy checks (not RLS-dependent), open-seat-only supersede, then insert or seat black.';

revoke all on function public.create_seated_game_guard(uuid, jsonb) from public;
grant execute on function public.create_seated_game_guard(uuid, jsonb) to authenticated;

drop function if exists public.supersede_free_seated_games_for_pair(uuid, uuid, uuid);

-- ---------------------------------------------------------------------------
-- INSERT open seat: cannot stack waiting rows or create while already seated
-- (Find Match uses direct insert; must match create_seated_game_guard rules.)
-- ---------------------------------------------------------------------------

drop policy if exists "games_authenticated_insert_free_open_seat" on public.games;

create policy "games_authenticated_insert_free_open_seat"
  on public.games
  for insert
  to authenticated
  with check (
    play_context = 'free'
    and tournament_id is null
    and white_player_id = (select auth.uid())
    and black_player_id is null
    and coalesce(status, '') in ('active', 'waiting')
    and not exists (
      select 1
      from public.games g
      where g.play_context = 'free'
        and g.tournament_id is null
        and g.status in ('active', 'waiting')
        and (
          (
            g.white_player_id is not null
            and g.black_player_id is not null
            and (
              g.white_player_id = (select auth.uid())
              or g.black_player_id = (select auth.uid())
            )
          )
          or (
            g.white_player_id = (select auth.uid())
            and g.black_player_id is null
          )
        )
    )
  );

comment on policy "games_authenticated_insert_free_open_seat" on public.games is
  'Free-play open seat: one waiting row per user; no new open seat while already in a full game.';
