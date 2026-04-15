-- Accept-challenge path: create_seated_game_guard INSERT omitted end_reason/result, so the table
-- default (often '' for text) could violate games_end_reason_check for new active rows.
-- Fix: explicit NULLs on insert + align column default to NULL for in-progress games.

alter table public.games alter column end_reason drop default;
alter table public.games alter column end_reason set default null;

update public.games
set end_reason = null
where status in ('active', 'waiting')
  and end_reason is not null
  and btrim(end_reason::text) = '';

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
