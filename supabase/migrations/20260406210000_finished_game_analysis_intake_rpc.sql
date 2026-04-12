-- Finished-game analysis intake (canonical read model for future engine / AI).
-- HARD BOUNDARY: returns NULL unless games.status = 'finished'. No active/waiting/live boards.
-- Preserves free vs tournament lineage via play_context, tournament_id, and explicit analysis_partition.

create or replace function public.get_finished_game_analysis_intake(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games%rowtype;
  v_ctx text;
  v_partition text;
begin
  if p_game_id is null then
    return null;
  end if;

  select *
    into g
  from public.games
  where id = p_game_id
    and status = 'finished';

  if not found then
    return null;
  end if;

  v_ctx := lower(trim(coalesce(g.play_context, 'free')));
  if v_ctx = 'tournament' then
    v_partition := 'tournament';
  elsif v_ctx = 'free' then
    v_partition := 'free';
  else
    v_partition := coalesce(nullif(v_ctx, ''), 'unknown');
  end if;

  return jsonb_build_object(
    'schema_version', 'fgi.1',
    'game', jsonb_build_object(
      'id', g.id,
      'status', g.status,
      'analysis_partition', v_partition,
      'play_context', g.play_context,
      'rated', g.rated,
      'tempo', g.tempo,
      'live_time_control', g.live_time_control,
      'source_type', g.source_type,
      'tournament_id', g.tournament_id,
      'mode', g.mode,
      'white_player_id', g.white_player_id,
      'black_player_id', g.black_player_id,
      'winner_id', g.winner_id,
      'result', g.result,
      'end_reason', g.end_reason,
      'finished_at', g.finished_at,
      'created_at', g.created_at,
      'final_fen', g.fen,
      'final_turn', g.turn
    ),
    'players', jsonb_build_object(
      'white', (
        select jsonb_build_object(
          'id', p.id,
          'username', nullif(trim(coalesce(p.username, '')), '')
        )
        from public.profiles p
        where p.id = g.white_player_id
      ),
      'black', (
        select jsonb_build_object(
          'id', p.id,
          'username', nullif(trim(coalesce(p.username, '')), '')
        )
        from public.profiles p
        where p.id = g.black_player_id
      )
    ),
    'move_logs', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'san', ml.san,
            'fen_before', ml.fen_before,
            'fen_after', ml.fen_after,
            'created_at', ml.created_at,
            'from_sq', ml.from_sq,
            'to_sq', ml.to_sq
          )
          order by ml.created_at asc
        )
        from public.game_move_logs ml
        where ml.game_id = g.id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

comment on function public.get_finished_game_analysis_intake(uuid) is
  'Canonical finished-game analysis intake. Finished-only; preserves free/tournament partition; curated payload for engine/AI — not for live games.';

revoke all on function public.get_finished_game_analysis_intake(uuid) from public;
-- Trusted callers only: no anon. Service role for batch/workers; authenticated for signed-in tooling.
grant execute on function public.get_finished_game_analysis_intake(uuid) to authenticated, service_role;
