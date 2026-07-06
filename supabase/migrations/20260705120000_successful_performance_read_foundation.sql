-- Successful Performance v1: self-only aggregate read RPC + finished rated player indexes.
-- Authoritative uncapped W/D/L aggregates for free-play (strict controls) and tournament/Battlefield lanes.

begin;

-- ---------------------------------------------------------------------------
-- Partial indexes: finished rated games by seated player
-- ---------------------------------------------------------------------------

create index if not exists games_finished_rated_white_player_idx
  on public.games (white_player_id)
  where status = 'finished'
    and rated is true;

create index if not exists games_finished_rated_black_player_idx
  on public.games (black_player_id)
  where status = 'finished'
    and rated is true;

-- ---------------------------------------------------------------------------
-- Strict Successful Performance control classifier (stricter than rating/badge)
-- ---------------------------------------------------------------------------

create function public.successful_performance_strict_control(
  p_tempo text,
  p_live_time_control text
)
returns text
language plpgsql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $f$
declare
  v_tempo text;
  v_ltc text;
begin
  v_tempo := lower(btrim(coalesce(p_tempo, '')));
  v_ltc := lower(regexp_replace(btrim(coalesce(p_live_time_control, '')), E'[[:space:]]+', '', 'g'));

  if v_ltc = '' then
    return null;
  end if;

  if v_ltc in ('20m', '5d', '5m+3s') then
    return null;
  end if;

  if v_tempo in ('daily', 'correspondence') and v_ltc ~ 'm$' then
    return null;
  end if;

  if v_tempo = 'live' and v_ltc ~ 'd$' then
    return null;
  end if;

  if v_tempo = 'live' then
    return case v_ltc
      when '1m' then '1+0'
      when '1+1' then '1+1'
      when '2m' then '2+0'
      when '2+0' then '2+0'
      when '2+1' then '2+1'
      when '3m' then '3+0'
      when '3+2' then '3+2'
      when '5m' then '5+0'
      when '5+5' then '5+5'
      when '10m' then '10+0'
      when '15m' then '15+0'
      when '30m' then '30+0'
      when '60m' then '60+0'
      else null
    end;
  end if;

  if v_tempo in ('daily', 'correspondence') then
    return case v_ltc
      when '1d' then '1d'
      when '2d' then '2d'
      when '3d' then '3d'
      when '7d' then '7d'
      else null
    end;
  end if;

  return null;
end;
$f$;

comment on function public.successful_performance_strict_control(text, text) is
  'SP v1 strict control map. Intentionally stricter than legacy rating/badge classifiers; rejects legacy 20m/5d/5m+3s and tempo/token mismatches.';

-- ---------------------------------------------------------------------------
-- Broad mode lookup from strict control label
-- ---------------------------------------------------------------------------

create function public.successful_performance_mode_from_control(p_control text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select case btrim(coalesce(p_control, ''))
    when '1+0' then 'bullet'
    when '1+1' then 'bullet'
    when '2+0' then 'bullet'
    when '2+1' then 'bullet'
    when '3+0' then 'blitz'
    when '3+2' then 'blitz'
    when '5+0' then 'blitz'
    when '5+5' then 'blitz'
    when '10+0' then 'rapid'
    when '15+0' then 'rapid'
    when '30+0' then 'rapid'
    when '60+0' then 'rapid'
    when '1d' then 'daily'
    when '2d' then 'daily'
    when '3d' then 'daily'
    when '7d' then 'daily'
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- Player-relative outcome (win / draw / loss) for SP scoring
-- ---------------------------------------------------------------------------

create function public.successful_performance_player_outcome(
  p_result text,
  p_player_id uuid,
  p_white_id uuid,
  p_black_id uuid
)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select case lower(btrim(coalesce(p_result, '')))
    when 'draw' then 'draw'
    when 'white_win' then case when p_player_id = p_white_id then 'win' else 'loss' end
    when 'black_win' then case when p_player_id = p_black_id then 'win' else 'loss' end
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- Self-only aggregate read RPC (no subject parameter; auth.uid() only)
-- ---------------------------------------------------------------------------

create function public.get_own_successful_performance()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $f$
declare
  v_uid uuid := auth.uid();
  v_free_modes jsonb := '[]'::jsonb;
  v_free_exact jsonb := '[]'::jsonb;
  v_battlefield_lifetime jsonb;
  v_tournaments jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  with common_eligible as (
    select
      g.tournament_id,
      case
        when g.play_context is null or btrim(g.play_context) = '' then 'free'
        else lower(btrim(g.play_context))
      end as play_context_norm,
      case when g.white_player_id = v_uid then 'white' else 'black' end as player_color,
      public.successful_performance_player_outcome(
        g.result,
        v_uid,
        g.white_player_id,
        g.black_player_id
      ) as outcome,
      public.successful_performance_strict_control(g.tempo, g.live_time_control) as strict_control
    from public.games g
    where g.status = 'finished'
      and g.rated is true
      and g.white_player_id is not null
      and g.black_player_id is not null
      and g.white_player_id <> g.black_player_id
      and (g.white_player_id = v_uid or g.black_player_id = v_uid)
      and lower(btrim(coalesce(g.source_type, ''))) <> 'bot_game'
      and g.bot_settings is null
      and lower(btrim(coalesce(g.result, ''))) in ('white_win', 'black_win', 'draw')
      and lower(btrim(coalesce(g.end_reason, ''))) not in (
        'superseded',
        'expired_open_seat',
        'abandoned_before_move',
        'no_first_move' -- parity with engine void semantics; production may not store this value
      )
      and exists (
        select 1
        from public.game_move_logs ml
        where ml.game_id = g.id
      )
  ),
  free_eligible as (
    select
      ce.player_color,
      ce.strict_control,
      public.successful_performance_mode_from_control(ce.strict_control) as mode_name,
      ce.outcome
    from common_eligible ce
    where ce.play_context_norm = 'free'
      and ce.tournament_id is null
      and ce.strict_control is not null
  ),
  exact_stats as (
    select
      fe.mode_name,
      fe.player_color,
      fe.strict_control as exact_control,
      count(*)::int as games,
      count(*) filter (where fe.outcome = 'win')::int as wins,
      count(*) filter (where fe.outcome = 'draw')::int as draws,
      count(*) filter (where fe.outcome = 'loss')::int as losses,
      (
        count(*) filter (where fe.outcome = 'win')
        + 0.5 * count(*) filter (where fe.outcome = 'draw')
      )::numeric as score
    from free_eligible fe
    group by fe.mode_name, fe.player_color, fe.strict_control
  ),
  exact_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'scope', 'exact_control',
          'mode', es.mode_name,
          'color', es.player_color,
          'exact_control', es.exact_control,
          'games', es.games,
          'wins', es.wins,
          'draws', es.draws,
          'losses', es.losses,
          'eligible_games', es.games,
          'score', es.score,
          'percentage', case when es.games > 0 then round((es.score / es.games) * 100, 1) else null end,
          'unlocked', es.games >= 10,
          'source_status', 'available'
        )
        order by es.mode_name, es.exact_control, es.player_color
      ),
      '[]'::jsonb
    ) as payload
    from exact_stats es
  ),
  exact_unlock_flags as (
    select
      es.mode_name,
      es.player_color,
      es.exact_control,
      es.games >= 10 as unlocked
    from exact_stats es
  ),
  mode_stats as (
    select
      fe.mode_name,
      fe.player_color,
      count(*)::int as games,
      count(*) filter (where fe.outcome = 'win')::int as wins,
      count(*) filter (where fe.outcome = 'draw')::int as draws,
      count(*) filter (where fe.outcome = 'loss')::int as losses,
      (
        count(*) filter (where fe.outcome = 'win')
        + 0.5 * count(*) filter (where fe.outcome = 'draw')
      )::numeric as score
    from free_eligible fe
    group by fe.mode_name, fe.player_color
  ),
  mode_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'scope', 'mode',
          'mode', ms.mode_name,
          'color', ms.player_color,
          'exact_control', null,
          'games', ms.games,
          'wins', ms.wins,
          'draws', ms.draws,
          'losses', ms.losses,
          'eligible_games', ms.games,
          'score', ms.score,
          'percentage', case when ms.games > 0 then round((ms.score / ms.games) * 100, 1) else null end,
          'unlocked',
            ms.games >= 100
            or (
              select count(*) = 4
              from exact_unlock_flags euf
              where euf.mode_name = ms.mode_name
                and euf.player_color = ms.player_color
                and euf.unlocked
                and euf.exact_control = any (
                  case ms.mode_name
                    when 'bullet' then array['1+0', '1+1', '2+0', '2+1']
                    when 'blitz' then array['3+0', '3+2', '5+0', '5+5']
                    when 'rapid' then array['10+0', '15+0', '30+0', '60+0']
                    when 'daily' then array['1d', '2d', '3d', '7d']
                    else array[]::text[]
                  end
                )
            ),
          'source_status', 'available'
        )
        order by ms.mode_name, ms.player_color
      ),
      '[]'::jsonb
    ) as payload
    from mode_stats ms
  ),
  tournament_eligible as (
    select
      ce.tournament_id,
      ce.outcome
    from common_eligible ce
    where ce.play_context_norm = 'tournament'
      and ce.tournament_id is not null
  ),
  tournament_stats as (
    select
      te.tournament_id,
      count(*)::int as games,
      count(*) filter (where te.outcome = 'win')::int as wins,
      count(*) filter (where te.outcome = 'draw')::int as draws,
      count(*) filter (where te.outcome = 'loss')::int as losses,
      (
        count(*) filter (where te.outcome = 'win')
        + 0.5 * count(*) filter (where te.outcome = 'draw')
      )::numeric as score
    from tournament_eligible te
    group by te.tournament_id
  ),
  tournament_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'scope', 'tournament',
          'tournament_id', ts.tournament_id,
          'mode', null,
          'color', 'combined',
          'exact_control', null,
          'games', ts.games,
          'wins', ts.wins,
          'draws', ts.draws,
          'losses', ts.losses,
          'eligible_games', ts.games,
          'score', ts.score,
          'percentage', case when ts.games > 0 then round((ts.score / ts.games) * 100, 1) else null end,
          'unlocked', true,
          'source_status', 'available'
        )
        order by ts.tournament_id
      ),
      '[]'::jsonb
    ) as payload
    from tournament_stats ts
  ),
  battlefield_lifetime as (
    select
      count(*)::int as games,
      count(*) filter (where te.outcome = 'win')::int as wins,
      count(*) filter (where te.outcome = 'draw')::int as draws,
      count(*) filter (where te.outcome = 'loss')::int as losses,
      (
        count(*) filter (where te.outcome = 'win')
        + 0.5 * count(*) filter (where te.outcome = 'draw')
      )::numeric as score
    from tournament_eligible te
  )
  select ej.payload, mj.payload, tj.payload,
    jsonb_build_object(
      'scope', 'battlefield',
      'mode', null,
      'color', 'combined',
      'exact_control', null,
      'games', bl.games,
      'wins', bl.wins,
      'draws', bl.draws,
      'losses', bl.losses,
      'eligible_games', bl.games,
      'score', bl.score,
      'percentage', case when bl.games > 0 then round((bl.score / bl.games) * 100, 1) else null end,
      'unlocked', true,
      'source_status', 'available'
    )
  into v_free_exact, v_free_modes, v_tournaments, v_battlefield_lifetime
  from exact_json ej
  cross join mode_json mj
  cross join tournament_json tj
  cross join battlefield_lifetime bl;

  return jsonb_build_object(
    'contract_version', 'successful_performance_v1',
    'source_status', 'available',
    'free_play', jsonb_build_object(
      'modes', v_free_modes,
      'exact_controls', v_free_exact
    ),
    'battlefield', jsonb_build_object(
      'lifetime', v_battlefield_lifetime,
      'tournaments', v_tournaments
    )
  );
end;
$f$;

comment on function public.get_own_successful_performance() is
  'Self-only Successful Performance v1 aggregates. Caller identity from auth.uid() only; no per-game rows or opponent IDs.';

-- ---------------------------------------------------------------------------
-- Privileges: self-only authenticated read; no anon/public execute
-- ---------------------------------------------------------------------------

revoke all on function public.successful_performance_strict_control(text, text) from public;
revoke all on function public.successful_performance_mode_from_control(text) from public;
revoke all on function public.successful_performance_player_outcome(text, uuid, uuid, uuid) from public;
revoke all on function public.get_own_successful_performance() from public;

revoke all on function public.get_own_successful_performance() from anon;

grant execute on function public.get_own_successful_performance() to authenticated;

commit;
