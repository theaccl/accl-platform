create or replace function public.apply_move_and_maybe_finish_system(
  p_game_id uuid,
  p_expected_fen text,
  p_next_fen text,
  p_next_turn text,
  p_last_move_at timestamptz,
  p_move_deadline_at timestamptz,
  p_white_clock_ms integer,
  p_black_clock_ms integer,
  p_promote_waiting_to_active boolean,
  p_result text,
  p_end_reason text
)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games%rowtype;
begin
  if p_game_id is null then
    raise exception 'game_id_required';
  end if;
  if nullif(trim(coalesce(p_next_fen, '')), '') is null then
    raise exception 'next_fen_required';
  end if;
  if nullif(trim(coalesce(p_next_turn, '')), '') is null then
    raise exception 'next_turn_required';
  end if;

  select * into g
  from public.games
  where id = p_game_id
  for update;

  if not found then
    raise exception 'game_not_found';
  end if;

  if p_expected_fen is not null and g.fen is distinct from p_expected_fen then
    raise exception 'optimistic_conflict';
  end if;

  update public.games
  set
    fen = p_next_fen,
    turn = p_next_turn,
    last_move_at = p_last_move_at,
    move_deadline_at = p_move_deadline_at,
    white_clock_ms = coalesce(p_white_clock_ms, g.white_clock_ms),
    black_clock_ms = coalesce(p_black_clock_ms, g.black_clock_ms),
    status = case
      when coalesce(p_promote_waiting_to_active, false) and g.status = 'waiting' then 'active'
      else g.status
    end
  where id = p_game_id
  returning * into g;

  if nullif(trim(coalesce(p_result, '')), '') is not null then
    g := public.finish_game_system(
      p_game_id,
      lower(trim(p_result)),
      nullif(trim(coalesce(p_end_reason, '')), '')
    );
  end if;

  return g;
end;
$$;

comment on function public.apply_move_and_maybe_finish_system(
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  integer,
  integer,
  boolean,
  text,
  text
) is 'Atomic move commit for server-authoritative submit-move path. Updates game state and optionally finalizes result in one transaction.';

revoke all on function public.apply_move_and_maybe_finish_system(
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  integer,
  integer,
  boolean,
  text,
  text
) from public;
grant execute on function public.apply_move_and_maybe_finish_system(
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  integer,
  integer,
  boolean,
  text,
  text
) to service_role;
