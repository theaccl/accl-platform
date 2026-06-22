-- Email verification Phase B3: close direct client competitive-state creation at the database boundary.
-- Application routes must call provisioningBlockedReason() before service_role mutations.
--
-- ROLLBACK — Option A (full restoration, dependency-safe; execute in this order):
--   1) grant insert, update on table public.match_requests to authenticated;
--   2) grant insert on table public.games to authenticated;
--   3) grant update on table public.games to authenticated;
--      (pre-B3 was table-wide UPDATE, not column-scoped)
--   4) grant insert on table public.tournament_entries to authenticated;
--   5) Re-apply the complete standalone function body from migration
--      20260529130000_hotfix_create_seated_game_guard_supersede_signature_alignment.sql
--      as public.create_seated_game_guard (must NOT call private.create_seated_game_guard_core).
--   6) revoke execute on function public.create_seated_game_server_guard(uuid, uuid, jsonb) from service_role;
--   7) drop function if exists public.create_seated_game_server_guard(uuid, uuid, jsonb);
--   8) drop function if exists private.create_seated_game_guard_core(uuid, uuid, jsonb);
--      ONLY after step 5 — dropping the core before step 5 breaks the shim left by this migration.
--   9) revoke all on function public.create_seated_game_guard(uuid, jsonb) from public;
--      grant execute on function public.create_seated_game_guard(uuid, jsonb) to authenticated;

begin;

create schema if not exists private;
comment on schema private is 'Internal SECURITY DEFINER helpers; no direct client access.';
revoke all on schema private from public;
create or replace function private.create_seated_game_guard_core(p_actor_id uuid, existing_open_seat_id uuid, payload jsonb)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := p_actor_id;
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
    raise exception 'invalid actor';
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
          and lower(btrim(coalesce(x.tempo, ''))) = 'live'
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
          and lower(btrim(coalesce(x.tempo, ''))) = 'live'
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
        v_white,
        v_black,
        g.id
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
        and lower(btrim(coalesce(x.tempo, ''))) = 'live'
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
      g.white_player_id,
      v_uid,
      g.id
    );
  end if;

  return g;
end;
$$;

revoke all on function private.create_seated_game_guard_core(uuid, uuid, jsonb) from public;
revoke all on function private.create_seated_game_guard_core(uuid, uuid, jsonb) from anon;
revoke all on function private.create_seated_game_guard_core(uuid, uuid, jsonb) from authenticated;

create or replace function public.create_seated_game_server_guard(
  p_actor_id uuid,
  existing_open_seat_id uuid,
  payload jsonb
)
returns public.games
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_actor_id is null then
    raise exception 'invalid actor';
  end if;
  return private.create_seated_game_guard_core(p_actor_id, existing_open_seat_id, payload);
end;
$$;

comment on function public.create_seated_game_server_guard(uuid, uuid, jsonb) is
  'Server-only seated-game creation. Caller must pass the server-validated actor UUID.';

revoke all on function public.create_seated_game_server_guard(uuid, uuid, jsonb) from public;
revoke all on function public.create_seated_game_server_guard(uuid, uuid, jsonb) from anon;
revoke all on function public.create_seated_game_server_guard(uuid, uuid, jsonb) from authenticated;
grant execute on function public.create_seated_game_server_guard(uuid, uuid, jsonb) to service_role;

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
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  return private.create_seated_game_guard_core(v_uid, existing_open_seat_id, payload);
end;
$$;

comment on function public.create_seated_game_guard(uuid, jsonb) is
  'Deprecated client entrypoint; EXECUTE revoked from authenticated. Rollback may re-grant for legacy callers.';

revoke all on function public.create_seated_game_guard(uuid, jsonb) from public;
revoke all on function public.create_seated_game_guard(uuid, jsonb) from anon;
revoke all on function public.create_seated_game_guard(uuid, jsonb) from authenticated;

-- match_requests: creation and mutation only through server routes (service_role).
revoke insert on table public.match_requests from public;
revoke insert on table public.match_requests from anon;
revoke insert on table public.match_requests from authenticated;
revoke update on table public.match_requests from public;
revoke update on table public.match_requests from anon;
revoke update on table public.match_requests from authenticated;

-- games: open-seat and challenge inserts only through server routes (service_role).
revoke insert on table public.games from public;
revoke insert on table public.games from anon;
revoke insert on table public.games from authenticated;

-- games: client UPDATE limited to draw-offer negotiation; seating/participant columns are server-only.
revoke update on table public.games from public;
revoke update on table public.games from anon;
revoke update on table public.games from authenticated;
grant update (draw_offered_by, draw_offered_at) on table public.games to authenticated;

comment on policy "games_authenticated_update_participant" on public.games is
  'Participant draw-offer updates only; column GRANT limits authenticated UPDATE to draw_offered_by/at.';

-- tournament_entries: registration only through gated server routes (service_role).
revoke insert on table public.tournament_entries from public;
revoke insert on table public.tournament_entries from anon;
revoke insert on table public.tournament_entries from authenticated;

commit;