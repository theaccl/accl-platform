-- Issue #34: persist the effective terminal clocks from the shared finish path.
-- The existing clock budget helper is the database counterpart of
-- lib/gameTimeControl.clockBudgetMsForGame.

begin;

alter function public.clock_budget_ms_for_live_sweep(text)
  set search_path = '';

create or replace function public.finish_game_core(
  p_game_id uuid,
  p_result text,
  p_end_reason text,
  p_actor uuid
)
returns public.games
language plpgsql
security definer
set search_path = ''
as $finish_game_core$
declare
  g public.games%rowtype;
  v_winner uuid;
  v_result text;
  v_uid uuid;
  v_finished_at timestamptz;
  v_elapsed_ms bigint := 0;
  v_clock_base_ms bigint;
  v_white_clock_ms bigint;
  v_black_clock_ms bigint;
  v_end_reason text;
  v_preserve_supplied_clocks boolean := false;
  v_clock_token text;
begin
  select * into g from public.games where id = p_game_id for update;
  if not found then
    raise exception 'game not found';
  end if;

  if g.status = 'finished' then
    return g;
  end if;

  if g.status is distinct from 'active' and g.status is distinct from 'waiting' then
    raise exception 'game not finishable';
  end if;

  v_uid := p_actor;
  if v_uid is not null then
    if v_uid is distinct from g.white_player_id
       and (g.black_player_id is null or v_uid is distinct from g.black_player_id) then
      raise exception 'not authorized';
    end if;
  end if;

  v_result := lower(trim(coalesce(p_result, '')));
  if v_result = '1/2-1/2' then
    v_result := 'draw';
  end if;

  if v_result = 'draw' then
    v_winner := null;
  elsif v_result = 'white_win' then
    v_winner := g.white_player_id;
  elsif v_result = 'black_win' then
    v_winner := g.black_player_id;
  else
    raise exception 'invalid result %', p_result;
  end if;

  v_finished_at := clock_timestamp();
  v_white_clock_ms := g.white_clock_ms;
  v_black_clock_ms := g.black_clock_ms;
  v_end_reason := lower(trim(coalesce(p_end_reason, '')));
  v_clock_token := lower(trim(coalesce(g.live_time_control, '')));
  v_preserve_supplied_clocks := p_actor is null
    and v_end_reason in (
      'checkmate',
      'stalemate',
      'insufficient_material',
      'threefold_repetition',
      'fifty_move_rule'
    );

  if lower(trim(coalesce(g.tempo, ''))) in ('live', 'daily')
     and g.last_move_at is not null
     and lower(trim(coalesce(g.turn, ''))) in ('white', 'black')
     and not v_preserve_supplied_clocks then
    v_clock_base_ms := case
      when lower(trim(g.tempo)) = 'daily'
       and v_clock_token !~ '^([0-9]+d|[0-9]+\+[0-9]+|[0-9]+m)$'
        then 30::bigint * 60000
      else public.clock_budget_ms_for_live_sweep(g.live_time_control)
    end;
    v_elapsed_ms := greatest(
      0,
      (extract(epoch from (v_finished_at - g.last_move_at)) * 1000)::bigint
    );
    v_white_clock_ms := coalesce(v_white_clock_ms, v_clock_base_ms);
    v_black_clock_ms := coalesce(v_black_clock_ms, v_clock_base_ms);

    if lower(trim(g.turn)) = 'white' then
      v_white_clock_ms := greatest(0, v_white_clock_ms - v_elapsed_ms);
    else
      v_black_clock_ms := greatest(0, v_black_clock_ms - v_elapsed_ms);
    end if;
  end if;

  update public.games
  set
    status = 'finished',
    result = v_result,
    winner_id = v_winner,
    end_reason = p_end_reason,
    finished_at = v_finished_at,
    white_clock_ms = v_white_clock_ms::integer,
    black_clock_ms = v_black_clock_ms::integer,
    draw_offered_by = null,
    draw_offered_at = null
  where id = p_game_id
  returning * into g;

  return g;
end;
$finish_game_core$;

comment on function public.finish_game_core(uuid, text, text, uuid) is
  'Shared guarded finish transition. Snapshots the effective active-side clock for non-move finishes and preserves clocks supplied by trusted atomic terminal moves.';

revoke all on function public.finish_game_core(uuid, text, text, uuid) from public;
revoke all on function public.finish_game_core(uuid, text, text, uuid) from anon;
revoke all on function public.finish_game_core(uuid, text, text, uuid) from authenticated;
revoke all on function public.finish_game_core(uuid, text, text, uuid) from service_role;

commit;
