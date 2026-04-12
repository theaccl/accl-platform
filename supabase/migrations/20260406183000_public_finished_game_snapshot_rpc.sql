-- Public finished-game replay RPC (privacy-safe read model).
-- Exposes curated fields + move log needed for read-only replay.
-- HARD BOUNDARY: returns NULL unless the game status is exactly 'finished'.

create or replace function public.get_public_finished_game_snapshot(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games%rowtype;
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
    -- Non-finished games are never publicly inspectable.
    return null;
  end if;

  return jsonb_build_object(
    'game', jsonb_build_object(
      'id', g.id,
      'status', g.status,
      'white_player_id', g.white_player_id,
      'black_player_id', g.black_player_id,
      'winner_id', g.winner_id,
      'result', g.result,
      'end_reason', g.end_reason,
      'finished_at', g.finished_at,
      'created_at', g.created_at,
      'mode', g.mode,
      'fen', g.fen,
      'turn', g.turn,
      'tempo', g.tempo,
      'live_time_control', g.live_time_control,
      'rated', g.rated,
      'play_context', g.play_context,
      'source_type', g.source_type,
      'tournament_id', g.tournament_id
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

comment on function public.get_public_finished_game_snapshot(uuid) is
  'Public finished-game replay snapshot. Finished-only enforced; curated fields + move logs for read-only replay.';

revoke all on function public.get_public_finished_game_snapshot(uuid) from public;
grant execute on function public.get_public_finished_game_snapshot(uuid) to anon, authenticated;

