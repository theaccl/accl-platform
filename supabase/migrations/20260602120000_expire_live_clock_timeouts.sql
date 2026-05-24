-- Phase 3A: server-authoritative free-play live clock timeout sweep.
-- Clock math must stay aligned with lib/liveClockExpiry.ts + lib/gameTimeControl.clockBudgetMsForGame.

-- ---------------------------------------------------------------------------
-- clock_budget_ms_for_live_sweep — live tempo budget (mirrors TS clockBudgetMsForGame for live)
-- ---------------------------------------------------------------------------

create or replace function public.clock_budget_ms_for_live_sweep(p_live_time_control text)
returns bigint
language plpgsql
immutable
as $$
declare
  v_token text;
  v_main int;
  v_days int;
  v_min int;
begin
  v_token := lower(btrim(coalesce(p_live_time_control, '')));

  if v_token ~ '^\d+d$' then
    v_days := substring(v_token from '^(\d+)d$')::int;
    return greatest(1, v_days)::bigint * 86400000;
  end if;

  if v_token ~ '^\d+\+\d+$' then
    v_main := split_part(v_token, '+', 1)::int;
    return greatest(1, v_main)::bigint * 60000;
  end if;

  if v_token ~ '^\d+m$' then
    v_min := substring(v_token from '^(\d+)m$')::int;
    return greatest(1, v_min)::bigint * 60000;
  end if;

  -- live default (TS: 5 minutes when token unrecognized)
  return 5::bigint * 60000;
end;
$$;

comment on function public.clock_budget_ms_for_live_sweep(text) is
  'Per-side clock budget ms for live sweep; keep in sync with lib/gameTimeControl.clockBudgetMsForGame (live).';

-- ---------------------------------------------------------------------------
-- live_clock_flagged_loser — side to move when clock exhausted; null when not expired / not applicable
-- ---------------------------------------------------------------------------

create or replace function public.live_clock_flagged_loser(
  p_tempo text,
  p_status text,
  p_turn text,
  p_last_move_at timestamptz,
  p_white_player_id uuid,
  p_black_player_id uuid,
  p_white_clock_ms bigint,
  p_black_clock_ms bigint,
  p_live_time_control text,
  p_now timestamptz
)
returns text
language plpgsql
stable
as $$
declare
  v_turn text;
  v_base bigint;
  v_white_stored bigint;
  v_black_stored bigint;
  v_elapsed bigint;
  v_active_remaining bigint;
begin
  if lower(btrim(coalesce(p_tempo, ''))) <> 'live' then
    return null;
  end if;

  if lower(btrim(coalesce(p_status, ''))) <> 'active' then
    return null;
  end if;

  if p_white_player_id is null
     or p_black_player_id is null
     or p_white_player_id = p_black_player_id then
    return null;
  end if;

  if p_last_move_at is null then
    return null;
  end if;

  v_turn := lower(btrim(coalesce(p_turn, '')));
  if v_turn not in ('white', 'black') then
    return null;
  end if;

  v_base := public.clock_budget_ms_for_live_sweep(p_live_time_control);
  v_white_stored := coalesce(p_white_clock_ms, v_base);
  v_black_stored := coalesce(p_black_clock_ms, v_base);

  v_elapsed := greatest(
    0,
    (extract(epoch from (p_now - p_last_move_at)) * 1000)::bigint
  );

  if v_turn = 'white' then
    v_active_remaining := v_white_stored - v_elapsed;
    if v_active_remaining <= 0 then
      return 'white';
    end if;
    return null;
  end if;

  v_active_remaining := v_black_stored - v_elapsed;
  if v_active_remaining <= 0 then
    return 'black';
  end if;

  return null;
end;
$$;

comment on function public.live_clock_flagged_loser(
  text, text, text, timestamptz, uuid, uuid, bigint, bigint, text, timestamptz
) is
  'Returns white|black when side to move is out of time; mirrors lib/liveClockExpiry.liveDailyClockTimeoutState (live, post-move).';

-- ---------------------------------------------------------------------------
-- expire_live_clock_timeouts — batch finish via finish_game_system (service_role / cron)
-- ---------------------------------------------------------------------------

create or replace function public.expire_live_clock_timeouts(p_batch integer default 25)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
  v_batch int := greatest(1, least(coalesce(p_batch, 25), 500));
  v_now timestamptz := clock_timestamp();
  r public.games%rowtype;
  v_flagged text;
  v_result text;
begin
  for r in
    select g.*
    from public.games g
    where g.status = 'active'
      and g.play_context = 'free'
      and g.tournament_id is null
      and lower(btrim(coalesce(g.tempo, ''))) = 'live'
      and g.white_player_id is not null
      and g.black_player_id is not null
      and g.white_player_id is distinct from g.black_player_id
      and g.last_move_at is not null
      and lower(btrim(coalesce(g.turn, ''))) in ('white', 'black')
      and public.live_clock_flagged_loser(
        g.tempo,
        g.status,
        g.turn,
        g.last_move_at,
        g.white_player_id,
        g.black_player_id,
        g.white_clock_ms,
        g.black_clock_ms,
        g.live_time_control,
        v_now
      ) is not null
    order by g.last_move_at asc
    limit v_batch
    for update skip locked
  loop
    v_flagged := public.live_clock_flagged_loser(
      r.tempo,
      r.status,
      r.turn,
      r.last_move_at,
      r.white_player_id,
      r.black_player_id,
      r.white_clock_ms,
      r.black_clock_ms,
      r.live_time_control,
      v_now
    );

    if v_flagged is null then
      continue;
    end if;

    v_result := case v_flagged
      when 'white' then 'black_win'
      else 'white_win'
    end;

    begin
      perform public.finish_game_system(r.id, v_result, 'timeout');
      n := n + 1;
    exception
      when others then
        raise warning 'expire_live_clock_timeouts: finish failed for game % — %', r.id, sqlerrm;
    end;
  end loop;

  return n;
end;
$$;

comment on function public.expire_live_clock_timeouts(integer) is
  'Finishes free-play live seated games where side to move exceeded clock; batch + SKIP LOCKED; idempotent via finish_game_core.';

revoke all on function public.clock_budget_ms_for_live_sweep(text) from public;
revoke all on function public.live_clock_flagged_loser(
  text, text, text, timestamptz, uuid, uuid, bigint, bigint, text, timestamptz
) from public;

revoke all on function public.expire_live_clock_timeouts(integer) from public;
grant execute on function public.expire_live_clock_timeouts(integer) to service_role;

-- ---------------------------------------------------------------------------
-- Index — active free live seated sweep candidates (clock filter applied in RPC)
-- ---------------------------------------------------------------------------

create index if not exists games_free_live_active_seated_sweep_idx
  on public.games (last_move_at asc)
  where status = 'active'
    and play_context = 'free'
    and tournament_id is null
    and lower(btrim(coalesce(tempo, ''))) = 'live'
    and white_player_id is not null
    and black_player_id is not null;

-- Operator / cron (service_role):
--   select public.expire_live_clock_timeouts(25);
-- Or POST /api/internal/live-clock-timeout/process with x-accl-live-timeout-sweep-secret.
