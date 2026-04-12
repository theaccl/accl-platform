-- Public read-only spectate snapshot for active/waiting games (finished delegates to existing RPC).
-- Respects ecosystem_scope vs viewer intent to avoid adult/K–12 crossover on public URLs.

create or replace function public.get_public_spectate_game_snapshot(
  p_game_id uuid,
  p_viewer_ecosystem text default 'adult'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games%rowtype;
  white_un text;
  black_un text;
  wl text;
  bl text;
begin
  if p_game_id is null then
    return null;
  end if;

  select *
    into g
    from public.games
    where id = p_game_id;

  if not found then
    return null;
  end if;

  if coalesce(nullif(trim(p_viewer_ecosystem), ''), 'adult') not in ('adult', 'k12') then
    return null;
  end if;

  if g.ecosystem_scope is distinct from coalesce(nullif(trim(p_viewer_ecosystem), ''), 'adult')::text then
    return null;
  end if;

  if g.status = 'finished' then
    return public.get_public_finished_game_snapshot(p_game_id);
  end if;

  if g.status not in ('active', 'waiting') then
    return null;
  end if;

  select nullif(trim(coalesce(p.username, '')), '')
    into white_un
    from public.profiles p
    where p.id = g.white_player_id;

  select nullif(trim(coalesce(p.username, '')), '')
    into black_un
    from public.profiles p
    where p.id = g.black_player_id;

  if g.ecosystem_scope = 'k12' then
    wl := 'K12-' || substring(replace(g.white_player_id::text, '-', '') from 1 for 6);
    bl := case
      when g.black_player_id is null then '—'
      else 'K12-' || substring(replace(g.black_player_id::text, '-', '') from 1 for 6)
    end;
  else
    wl := coalesce(white_un, 'W:' || substring(g.white_player_id::text from 1 for 6));
    bl := case
      when g.black_player_id is null then '—'
      else coalesce(black_un, 'B:' || substring(g.black_player_id::text from 1 for 6))
    end;
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
      'tournament_id', g.tournament_id,
      'draw_offered_by', g.draw_offered_by,
      'draw_offered_at', g.draw_offered_at,
      'last_move_at', g.last_move_at,
      'move_deadline_at', g.move_deadline_at,
      'white_clock_ms', g.white_clock_ms,
      'black_clock_ms', g.black_clock_ms
    ),
    'spectate_labels', jsonb_build_object('white', wl, 'black', bl),
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

comment on function public.get_public_spectate_game_snapshot(uuid, text) is
  'Public spectate snapshot for active/waiting games (finished delegates). Ecosystem must match viewer.';

revoke all on function public.get_public_spectate_game_snapshot(uuid, text) from public;
grant execute on function public.get_public_spectate_game_snapshot(uuid, text) to anon, authenticated;
