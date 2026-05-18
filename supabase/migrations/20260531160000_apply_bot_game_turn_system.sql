create or replace function public.apply_bot_game_turn_system(
  p_game_id uuid,
  p_expected_fen text,
  p_human_next_fen text,
  p_human_next_turn text,
  p_human_last_move_at timestamptz,
  p_human_move_deadline_at timestamptz,
  p_human_white_clock_ms integer,
  p_human_black_clock_ms integer,
  p_human_promote_waiting_to_active boolean,
  p_human_result text,
  p_human_end_reason text,
  p_human_move_log jsonb,
  p_bot_next_fen text,
  p_bot_next_turn text,
  p_bot_last_move_at timestamptz,
  p_bot_move_deadline_at timestamptz,
  p_bot_white_clock_ms integer,
  p_bot_black_clock_ms integer,
  p_bot_result text,
  p_bot_end_reason text,
  p_bot_move_log jsonb
)
returns public.games
language plpgsql
security definer
set search_path = public
as $botturn$
declare
  g public.games%rowtype;
  v_human_finish text;
  v_bot_finish text;
  v_human_idem text;
  v_bot_idem text;
  v_human_log public.game_move_logs%rowtype;
  v_bot_log public.game_move_logs%rowtype;
  v_human_log_found boolean := false;
  v_bot_log_found boolean := false;
  v_skip_human_update boolean := false;
  v_skip_bot_update boolean := false;
  v_apply_bot boolean := false;
  v_log_game_id uuid;
  v_player_id uuid;
  v_san text;
  v_from_sq text;
  v_to_sq text;
  v_fen_before text;
  v_fen_after text;
  v_move_duration_ms integer;
begin
  if p_game_id is null then
    raise exception 'game_id_required';
  end if;
  if nullif(trim(coalesce(p_human_next_fen, '')), '') is null then
    raise exception 'next_fen_required';
  end if;
  if nullif(trim(coalesce(p_human_next_turn, '')), '') is null then
    raise exception 'next_turn_required';
  end if;

  select * into g
  from public.games
  where id = p_game_id
  for update;

  if not found then
    raise exception 'game_not_found';
  end if;

  if coalesce(g.source_type, '') is distinct from 'bot_game' then
    raise exception 'not_bot_game';
  end if;

  if coalesce(g.status, '') not in ('active', 'waiting') then
    raise exception 'game_not_playable';
  end if;

  v_human_finish := nullif(trim(coalesce(p_human_result, '')), '');
  v_bot_finish := nullif(trim(coalesce(p_bot_result, '')), '');
  v_apply_bot := v_human_finish is null
    and p_bot_move_log is not null
    and jsonb_typeof(p_bot_move_log) = 'object'
    and nullif(trim(coalesce(p_bot_next_fen, '')), '') is not null
    and nullif(trim(coalesce(p_bot_next_turn, '')), '') is not null;

  if p_human_move_log is null or jsonb_typeof(p_human_move_log) <> 'object' then
    raise exception 'move_log_invalid_payload';
  end if;

  v_human_idem := nullif(trim(coalesce(p_human_move_log->>'idempotency_key', '')), '');
  if v_apply_bot then
    v_bot_idem := nullif(trim(coalesce(p_bot_move_log->>'idempotency_key', '')), '');
  end if;

  if v_human_idem is not null then
    select * into v_human_log
    from public.game_move_logs
    where game_id = p_game_id
      and idempotency_key = v_human_idem
    limit 1;

    if found then
      v_human_log_found := true;
      if v_human_log.fen_after is distinct from nullif(trim(coalesce(p_human_move_log->>'fen_after', '')), '')
        or v_human_log.from_sq is distinct from nullif(trim(coalesce(p_human_move_log->>'from_sq', '')), '')
        or v_human_log.to_sq is distinct from nullif(trim(coalesce(p_human_move_log->>'to_sq', '')), '')
      then
        raise exception 'idempotency_key_conflict';
      end if;

      if g.fen is not distinct from nullif(trim(coalesce(p_human_move_log->>'fen_after', '')), '')
        or g.fen is not distinct from p_human_next_fen
      then
        v_skip_human_update := true;
      elsif g.fen is not distinct from p_expected_fen then
        v_skip_human_update := false;
      else
        raise exception 'optimistic_conflict';
      end if;
    end if;
  elsif p_expected_fen is not null and g.fen is distinct from p_expected_fen then
    raise exception 'optimistic_conflict';
  end if;

  if v_apply_bot and v_bot_idem is not null then
    select * into v_bot_log
    from public.game_move_logs
    where game_id = p_game_id
      and idempotency_key = v_bot_idem
    limit 1;

    if found then
      v_bot_log_found := true;
      if v_bot_log.fen_after is distinct from nullif(trim(coalesce(p_bot_move_log->>'fen_after', '')), '')
        or v_bot_log.from_sq is distinct from nullif(trim(coalesce(p_bot_move_log->>'from_sq', '')), '')
        or v_bot_log.to_sq is distinct from nullif(trim(coalesce(p_bot_move_log->>'to_sq', '')), '')
      then
        raise exception 'idempotency_key_conflict';
      end if;
    end if;
  end if;

  if v_human_log_found
    and (not v_apply_bot or v_bot_log_found)
    and (
      (v_apply_bot and g.fen is not distinct from p_bot_next_fen)
      or (not v_apply_bot and (g.fen is not distinct from p_human_next_fen or g.status = 'finished'))
    )
  then
    select * into g from public.games where id = p_game_id;
    return g;
  end if;

  if not v_skip_human_update then
    if p_expected_fen is not null and g.fen is distinct from p_expected_fen then
      raise exception 'optimistic_conflict';
    end if;

    update public.games
    set
      fen = p_human_next_fen,
      turn = p_human_next_turn,
      last_move_at = p_human_last_move_at,
      move_deadline_at = p_human_move_deadline_at,
      white_clock_ms = coalesce(p_human_white_clock_ms, g.white_clock_ms),
      black_clock_ms = coalesce(p_human_black_clock_ms, g.black_clock_ms),
      status = case
        when coalesce(p_human_promote_waiting_to_active, false) and g.status = 'waiting' then 'active'
        else g.status
      end
    where id = p_game_id
    returning * into g;

    if not found then
      raise exception 'game_not_found';
    end if;
  end if;

  if not v_human_log_found then
    begin
      v_log_game_id := nullif(trim(coalesce(p_human_move_log->>'game_id', '')), '')::uuid;
    exception
      when others then
        raise exception 'move_log_invalid_payload';
    end;
    if v_log_game_id is null or v_log_game_id is distinct from p_game_id then
      raise exception 'move_log_invalid_payload';
    end if;
    begin
      v_player_id := nullif(trim(coalesce(p_human_move_log->>'player_id', '')), '')::uuid;
    exception
      when others then
        raise exception 'move_log_invalid_payload';
    end;
    if v_player_id is null then
      raise exception 'move_log_invalid_payload';
    end if;
    v_san := nullif(trim(coalesce(p_human_move_log->>'san', '')), '');
    v_from_sq := nullif(trim(coalesce(p_human_move_log->>'from_sq', '')), '');
    v_to_sq := nullif(trim(coalesce(p_human_move_log->>'to_sq', '')), '');
    v_fen_before := nullif(trim(coalesce(p_human_move_log->>'fen_before', '')), '');
    v_fen_after := nullif(trim(coalesce(p_human_move_log->>'fen_after', '')), '');
    if v_san is null or v_from_sq is null or v_to_sq is null or v_fen_after is null then
      raise exception 'move_log_invalid_payload';
    end if;
    begin
      v_move_duration_ms := coalesce((p_human_move_log->>'move_duration_ms')::integer, 0);
    exception
      when others then
        raise exception 'move_log_invalid_payload';
    end;

    if v_human_idem is not null then
      insert into public.game_move_logs (
        game_id,
        player_id,
        san,
        from_sq,
        to_sq,
        fen_before,
        fen_after,
        move_duration_ms,
        idempotency_key
      )
      values (
        p_game_id,
        v_player_id,
        v_san,
        v_from_sq,
        v_to_sq,
        v_fen_before,
        v_fen_after,
        v_move_duration_ms,
        v_human_idem
      );
    else
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
        v_fen_before,
        v_fen_after,
        v_move_duration_ms
      );
    end if;
  end if;

  if v_human_finish is not null then
    return public.finish_game_system(
      p_game_id,
      lower(trim(v_human_finish)),
      nullif(trim(coalesce(p_human_end_reason, '')), '')
    );
  end if;

  if not v_apply_bot then
    return g;
  end if;

  if g.fen is distinct from p_human_next_fen then
    raise exception 'optimistic_conflict';
  end if;

  if v_bot_log_found and g.fen is not distinct from p_bot_next_fen then
    select * into g from public.games where id = p_game_id;
    return g;
  end if;

  update public.games
  set
    fen = p_bot_next_fen,
    turn = p_bot_next_turn,
    last_move_at = p_bot_last_move_at,
    move_deadline_at = p_bot_move_deadline_at,
    white_clock_ms = coalesce(p_bot_white_clock_ms, g.white_clock_ms),
    black_clock_ms = coalesce(p_bot_black_clock_ms, g.black_clock_ms)
  where id = p_game_id
  returning * into g;

  if not found then
    raise exception 'game_not_found';
  end if;

  if not v_bot_log_found then
    begin
      v_log_game_id := nullif(trim(coalesce(p_bot_move_log->>'game_id', '')), '')::uuid;
    exception
      when others then
        raise exception 'move_log_invalid_payload';
    end;
    if v_log_game_id is null or v_log_game_id is distinct from p_game_id then
      raise exception 'move_log_invalid_payload';
    end if;
    begin
      v_player_id := nullif(trim(coalesce(p_bot_move_log->>'player_id', '')), '')::uuid;
    exception
      when others then
        raise exception 'move_log_invalid_payload';
    end;
    if v_player_id is null then
      raise exception 'move_log_invalid_payload';
    end if;
    v_san := nullif(trim(coalesce(p_bot_move_log->>'san', '')), '');
    v_from_sq := nullif(trim(coalesce(p_bot_move_log->>'from_sq', '')), '');
    v_to_sq := nullif(trim(coalesce(p_bot_move_log->>'to_sq', '')), '');
    v_fen_before := nullif(trim(coalesce(p_bot_move_log->>'fen_before', '')), '');
    v_fen_after := nullif(trim(coalesce(p_bot_move_log->>'fen_after', '')), '');
    if v_san is null or v_from_sq is null or v_to_sq is null or v_fen_after is null then
      raise exception 'move_log_invalid_payload';
    end if;
    begin
      v_move_duration_ms := coalesce((p_bot_move_log->>'move_duration_ms')::integer, 0);
    exception
      when others then
        raise exception 'move_log_invalid_payload';
    end;

    if v_bot_idem is not null then
      insert into public.game_move_logs (
        game_id,
        player_id,
        san,
        from_sq,
        to_sq,
        fen_before,
        fen_after,
        move_duration_ms,
        idempotency_key
      )
      values (
        p_game_id,
        v_player_id,
        v_san,
        v_from_sq,
        v_to_sq,
        v_fen_before,
        v_fen_after,
        v_move_duration_ms,
        v_bot_idem
      );
    else
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
        v_fen_before,
        v_fen_after,
        v_move_duration_ms
      );
    end if;
  end if;

  if v_bot_finish is not null then
    return public.finish_game_system(
      p_game_id,
      lower(trim(v_bot_finish)),
      nullif(trim(coalesce(p_bot_end_reason, '')), '')
    );
  end if;

  return g;
end;
$botturn$;

comment on function public.apply_bot_game_turn_system(
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
  jsonb,
  text,
  text,
  timestamptz,
  timestamptz,
  integer,
  integer,
  text,
  text,
  jsonb
) is 'Atomic bot-game turn: human ply + log, optional bot ply + log, optional finish (Phase 1G).';

revoke all on function public.apply_bot_game_turn_system(
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
  jsonb,
  text,
  text,
  timestamptz,
  timestamptz,
  integer,
  integer,
  text,
  text,
  jsonb
) from public;

grant execute on function public.apply_bot_game_turn_system(
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
  jsonb,
  text,
  text,
  timestamptz,
  timestamptz,
  integer,
  integer,
  text,
  text,
  jsonb
) to service_role;
