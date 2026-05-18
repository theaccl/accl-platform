-- Phase 1D: optional move log insert inside apply_move_and_maybe_finish_system (same transaction).

drop function if exists public.apply_move_and_maybe_finish_system(
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
);

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
  p_end_reason text,
  p_move_log jsonb default null
)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games%rowtype;
  v_log_game_id uuid;
  v_player_id uuid;
  v_san text;
  v_from_sq text;
  v_to_sq text;
  v_fen_after text;
  v_move_duration_ms integer;
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

  if p_move_log is not null then
    begin
      v_log_game_id := nullif(trim(coalesce(p_move_log->>'game_id', '')), '')::uuid;
    exception
      when others then
        raise exception 'move_log_invalid_payload';
    end;

    if v_log_game_id is null or v_log_game_id is distinct from p_game_id then
      raise exception 'move_log_invalid_payload';
    end if;

    begin
      v_player_id := nullif(trim(coalesce(p_move_log->>'player_id', '')), '')::uuid;
    exception
      when others then
        raise exception 'move_log_invalid_payload';
    end;

    if v_player_id is null then
      raise exception 'move_log_invalid_payload';
    end if;

    v_san := nullif(trim(coalesce(p_move_log->>'san', '')), '');
    v_from_sq := nullif(trim(coalesce(p_move_log->>'from_sq', '')), '');
    v_to_sq := nullif(trim(coalesce(p_move_log->>'to_sq', '')), '');
    v_fen_after := nullif(trim(coalesce(p_move_log->>'fen_after', '')), '');

    if v_san is null or v_from_sq is null or v_to_sq is null or v_fen_after is null then
      raise exception 'move_log_invalid_payload';
    end if;

    begin
      v_move_duration_ms := coalesce((p_move_log->>'move_duration_ms')::integer, 0);
    exception
      when others then
        raise exception 'move_log_invalid_payload';
    end;

    insert into public.game_move_logs (
      game_id,
      player_id,
      san,
      from_sq,
      to_sq,
      fen_before,
      fen_after,
      move_duration_ms
    )
    values (
      p_game_id,
      v_player_id,
      v_san,
      v_from_sq,
      v_to_sq,
      nullif(trim(coalesce(p_move_log->>'fen_before', '')), ''),
      v_fen_after,
      v_move_duration_ms
    );
  end if;

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
  text,
  jsonb
) is 'Atomic move commit: game update, optional game_move_logs insert, optional finish in one transaction.';

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
  text,
  jsonb
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
  text,
  jsonb
) to service_role;
