alter table public.game_move_logs
  add column if not exists idempotency_key text;

create unique index if not exists game_move_logs_game_idempotency_key_uidx
  on public.game_move_logs (game_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.finish_game_system(
  p_game_id uuid,
  p_result text,
  p_end_reason text
)
returns public.games
language plpgsql
security definer
set search_path = public
as $finish$
begin
  return public.finish_game_core(p_game_id, p_result, p_end_reason, null);
end;
$finish$;

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
  text,
  jsonb
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
as $apply$
declare
  g public.games%rowtype;
  v_log_game_id uuid;
  v_player_id uuid;
  v_san text;
  v_from_sq text;
  v_to_sq text;
  v_fen_before text;
  v_fen_after text;
  v_move_duration_ms integer;
  v_idempotency_key text;
  v_existing_log public.game_move_logs%rowtype;
  v_existing_log_found boolean := false;
  v_skip_game_update boolean := false;
  v_finish_result text;
  v_finish_reason text;
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

  v_finish_result := nullif(trim(coalesce(p_result, '')), '');
  v_finish_reason := nullif(trim(coalesce(p_end_reason, '')), '');

  if p_move_log is not null and jsonb_typeof(p_move_log) = 'object' then
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
    v_fen_before := nullif(trim(coalesce(p_move_log->>'fen_before', '')), '');
    v_fen_after := nullif(trim(coalesce(p_move_log->>'fen_after', '')), '');
    v_idempotency_key := nullif(trim(coalesce(p_move_log->>'idempotency_key', '')), '');

    if v_san is null or v_from_sq is null or v_to_sq is null or v_fen_after is null then
      raise exception 'move_log_invalid_payload';
    end if;

    begin
      v_move_duration_ms := coalesce((p_move_log->>'move_duration_ms')::integer, 0);
    exception
      when others then
        raise exception 'move_log_invalid_payload';
    end;

    if v_idempotency_key is not null then
      select * into v_existing_log
      from public.game_move_logs
      where game_id = p_game_id
        and idempotency_key = v_idempotency_key
      limit 1;

      if found then
        v_existing_log_found := true;

        if v_existing_log.player_id is distinct from v_player_id
          or v_existing_log.from_sq is distinct from v_from_sq
          or v_existing_log.to_sq is distinct from v_to_sq
          or v_existing_log.fen_after is distinct from v_fen_after
          or (
            v_fen_before is not null
            and v_existing_log.fen_before is not null
            and v_existing_log.fen_before is distinct from v_fen_before
          )
        then
          raise exception 'idempotency_key_conflict';
        end if;

        if g.fen is not distinct from v_fen_after
          or g.fen is not distinct from p_next_fen
        then
          v_skip_game_update := true;
        elsif g.fen is not distinct from p_expected_fen then
          v_skip_game_update := false;
        else
          raise exception 'optimistic_conflict';
        end if;
      end if;
    end if;
  end if;

  if v_existing_log_found and v_skip_game_update then
    select * into g
    from public.games
    where id = p_game_id;

    if not found then
      raise exception 'game_not_found';
    end if;

    if v_finish_result is not null then
      return public.finish_game_system(
        p_game_id,
        lower(trim(v_finish_result)),
        v_finish_reason
      );
    end if;

    return g;
  end if;

  if not v_skip_game_update then
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

    if not found then
      raise exception 'game_not_found';
    end if;
  end if;

  if p_move_log is not null
    and jsonb_typeof(p_move_log) = 'object'
    and not v_existing_log_found
  then
    if v_idempotency_key is not null then
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
        v_idempotency_key
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

  if v_finish_result is not null then
    return public.finish_game_system(
      p_game_id,
      lower(trim(v_finish_result)),
      v_finish_reason
    );
  end if;

  return g;
end;
$apply$;

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
