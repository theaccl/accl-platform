-- Free-play Daily concurrency authority (rated obligations + unrated waiting queue).
-- Additive only: does not alter live-seat RLS, live busy checks, or supersede semantics.
-- Client UX guards in lib/freePlayDailyConcurrency.ts mirror these rules for messaging.

begin;

-- ---------------------------------------------------------------------------
-- 1) Pure count helpers (STABLE, no locks)
-- ---------------------------------------------------------------------------

create or replace function public.free_play_count_rated_daily_obligations(p_uid uuid)
returns integer
language sql
stable
parallel safe
security definer
set search_path = pg_catalog, pg_temp
as $$
  select count(*)::integer
  from public.games g
  where lower(btrim(coalesce(g.play_context, ''))) = 'free'
    and g.tournament_id is null
    and lower(btrim(coalesce(g.tempo, ''))) = 'daily'
    and coalesce(g.rated, false) = true
    and lower(btrim(coalesce(g.status, ''))) in ('active', 'waiting')
    and p_uid in (g.white_player_id, g.black_player_id);
$$;

comment on function public.free_play_count_rated_daily_obligations(uuid) is
  'Rated free Daily obligations (waiting + seated), global across controls; terminal status excluded.';

create or replace function public.free_play_count_unrated_daily_waiting_seats(p_uid uuid)
returns integer
language sql
stable
parallel safe
security definer
set search_path = pg_catalog, pg_temp
as $$
  select count(*)::integer
  from public.games g
  where lower(btrim(coalesce(g.play_context, ''))) = 'free'
    and g.tournament_id is null
    and lower(btrim(coalesce(g.tempo, ''))) = 'daily'
    and coalesce(g.rated, false) = false
    and lower(btrim(coalesce(g.status, ''))) in ('active', 'waiting')
    and g.white_player_id = p_uid
    and g.black_player_id is null;
$$;

comment on function public.free_play_count_unrated_daily_waiting_seats(uuid) is
  'Host-owned unrated Daily waiting open seats only; seated unrated games do not count.';

revoke all on function public.free_play_count_rated_daily_obligations(uuid) from public;
revoke all on function public.free_play_count_unrated_daily_waiting_seats(uuid) from public;

-- ---------------------------------------------------------------------------
-- 2) Row-state helpers for trigger delta (IMMUTABLE; no locks)
-- ---------------------------------------------------------------------------

create or replace function public.free_play_rated_daily_obligation_participants(
  p_play_context text,
  p_tournament_id uuid,
  p_tempo text,
  p_rated boolean,
  p_status text,
  p_end_reason text,
  p_white_player_id uuid,
  p_black_player_id uuid
)
returns uuid[]
language sql
immutable
parallel safe
security definer
set search_path = pg_catalog, pg_temp
as $$
  select case
    when lower(btrim(coalesce(p_play_context, ''))) <> 'free'
      or p_tournament_id is not null
      or lower(btrim(coalesce(p_tempo, ''))) <> 'daily'
      or coalesce(p_rated, false) <> true
      or lower(btrim(coalesce(p_status, ''))) not in ('active', 'waiting')
    then array[]::uuid[]
    else array_remove(array[p_white_player_id, p_black_player_id]::uuid[], null::uuid)
  end;
$$;

create or replace function public.free_play_unrated_daily_waiting_host(
  p_play_context text,
  p_tournament_id uuid,
  p_tempo text,
  p_rated boolean,
  p_status text,
  p_end_reason text,
  p_white_player_id uuid,
  p_black_player_id uuid
)
returns uuid
language sql
immutable
parallel safe
security definer
set search_path = pg_catalog, pg_temp
as $$
  select case
    when lower(btrim(coalesce(p_play_context, ''))) <> 'free'
      or p_tournament_id is not null
      or lower(btrim(coalesce(p_tempo, ''))) <> 'daily'
      or coalesce(p_rated, false) = true
      or lower(btrim(coalesce(p_status, ''))) not in ('active', 'waiting')
      or p_white_player_id is null
      or p_black_player_id is not null
    then null::uuid
    else p_white_player_id
  end;
$$;

revoke all on function public.free_play_rated_daily_obligation_participants(
  text, uuid, text, boolean, text, text, uuid, uuid
) from public;
revoke all on function public.free_play_unrated_daily_waiting_host(
  text, uuid, text, boolean, text, text, uuid, uuid
) from public;

-- ---------------------------------------------------------------------------
-- 3) VOLATILE lock-and-assert (authoritative cap enforcement primitive)
-- ---------------------------------------------------------------------------

create or replace function public.free_play_assert_daily_cap(
  p_uid uuid,
  p_cap_kind text
)
returns void
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_count integer;
  v_cap constant integer := 5;
begin
  if p_uid is null then
    return;
  end if;

  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'free_play_daily_requires_read_committed'
      using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('free_daily_cap:' || p_uid::text, 0)
  );

  if lower(btrim(coalesce(p_cap_kind, ''))) = 'rated' then
    v_count := public.free_play_count_rated_daily_obligations(p_uid);
    if v_count >= v_cap then
      raise exception 'free_play_daily_rated_cap'
        using errcode = 'P0001';
    end if;
    return;
  end if;

  if lower(btrim(coalesce(p_cap_kind, ''))) in ('unrated_waiting', 'unrated') then
    v_count := public.free_play_count_unrated_daily_waiting_seats(p_uid);
    if v_count >= v_cap then
      raise exception 'free_play_daily_unrated_waiting_cap'
        using errcode = 'P0001';
    end if;
    return;
  end if;

  raise exception 'free_play_assert_daily_cap: invalid cap kind %', p_cap_kind
    using errcode = '22023';
end;
$$;

comment on function public.free_play_assert_daily_cap(uuid, text) is
  'Transaction-scoped Daily cap assert; READ COMMITTED only; lock then recount. Kinds: rated | unrated_waiting.';

revoke all on function public.free_play_assert_daily_cap(uuid, text) from public;

-- ---------------------------------------------------------------------------
-- 4) BEFORE INSERT OR UPDATE trigger (delta obligations only)
-- ---------------------------------------------------------------------------

create or replace function public.trg_games_enforce_free_daily_concurrency()
returns trigger
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  new_rated_parts uuid[];
  old_rated_parts uuid[];
  added_rated_parts uuid[];
  new_waiting_host uuid;
  old_waiting_host uuid;
  u uuid;
begin
  -- Fast path: non-free-play or tournament rows never enter Daily cap logic.
  if lower(btrim(coalesce(new.play_context, ''))) <> 'free' or new.tournament_id is not null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if lower(btrim(coalesce(old.play_context, ''))) <> 'free' or old.tournament_id is not null then
      -- Row entering free play from tournament/other context: treat OLD as empty obligation state.
      old_rated_parts := array[]::uuid[];
      old_waiting_host := null;
    else
      old_rated_parts := public.free_play_rated_daily_obligation_participants(
        old.play_context,
        old.tournament_id,
        old.tempo,
        old.rated,
        old.status,
        old.end_reason,
        old.white_player_id,
        old.black_player_id
      );
      old_waiting_host := public.free_play_unrated_daily_waiting_host(
        old.play_context,
        old.tournament_id,
        old.tempo,
        old.rated,
        old.status,
        old.end_reason,
        old.white_player_id,
        old.black_player_id
      );
    end if;
  else
    old_rated_parts := array[]::uuid[];
    old_waiting_host := null;
  end if;

  new_rated_parts := public.free_play_rated_daily_obligation_participants(
    new.play_context,
    new.tournament_id,
    new.tempo,
    new.rated,
    new.status,
    new.end_reason,
    new.white_player_id,
    new.black_player_id
  );

  new_waiting_host := public.free_play_unrated_daily_waiting_host(
    new.play_context,
    new.tournament_id,
    new.tempo,
    new.rated,
    new.status,
    new.end_reason,
    new.white_player_id,
    new.black_player_id
  );

  -- Rated: NEW participants EXCEPT OLD participants (dedupe + ascending lock order).
  select coalesce(array_agg(distinct np order by np), array[]::uuid[])
  into added_rated_parts
  from unnest(new_rated_parts) as np
  where not (np = any (coalesce(old_rated_parts, array[]::uuid[])));

  if added_rated_parts is not null and cardinality(added_rated_parts) > 0 then
    foreach u in array added_rated_parts loop
      perform public.free_play_assert_daily_cap(u, 'rated');
    end loop;
  end if;

  -- Unrated waiting host: NEW host EXCEPT OLD host (accept removes host without asserting).
  if new_waiting_host is not null
     and (old_waiting_host is null or new_waiting_host is distinct from old_waiting_host) then
    perform public.free_play_assert_daily_cap(new_waiting_host, 'unrated_waiting');
  end if;

  return new;
end;
$$;

comment on function public.trg_games_enforce_free_daily_concurrency() is
  'BEFORE INSERT/UPDATE: assert Daily caps only when NEW adds rated participants or unrated waiting host.';

revoke all on function public.trg_games_enforce_free_daily_concurrency() from public;

drop trigger if exists trg_games_enforce_free_daily_concurrency on public.games;

create trigger trg_games_enforce_free_daily_concurrency
  before insert or update on public.games
  for each row
  execute function public.trg_games_enforce_free_daily_concurrency();

comment on trigger trg_games_enforce_free_daily_concurrency on public.games is
  'Authoritative free Daily concurrency: rated obligations (5) and unrated waiting seats (5).';

-- ACCL_DIRECT_ACCEPT_TWO_PLAYER_INSERT_RLS_AUDIT_REQUIRED
-- Direct two-player accept INSERT may not satisfy games_authenticated_insert_free_open_seat (black_player_id IS NULL).
-- This migration does not alter RLS; audit accept-path INSERT policies before enabling direct seated INSERT.

-- ACCL_OPEN_SEAT_RAW_UPDATE_AUTHORITY_HARDENING_REQUIRED
-- This slice enforces Daily caps on obligation-adding INSERT/UPDATE transitions, including
-- White PATCHing black_player_id on an open seat. It does NOT fully close non-Daily seating
-- authority (live joiner-busy, supersede, duplicate-pair) on raw UPDATE outside
-- create_seated_game_guard. Future narrow options: column-level UPDATE grants, seating-only RPC,
-- or restrictive transition policy requiring OLD.black IS NULL guard via trigger extension.

commit;
