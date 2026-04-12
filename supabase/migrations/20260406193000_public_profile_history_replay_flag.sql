-- Public profile history RPC: add replay availability signal.
-- Policy: public replay is available for finished games only (enforced in the replay snapshot RPC).

create or replace function public.get_public_profile_history(
  p_profile_id uuid,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int;
begin
  if p_profile_id is null then
    return '[]'::jsonb;
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 50), 200));

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'game_id', g.id,
          'opponent_id', opp.id,
          'opponent_username', nullif(trim(coalesce(opp.username, '')), ''),
          'result', g.result,
          'end_reason', g.end_reason,
          'finished_at', g.finished_at,
          'tempo', g.tempo,
          'live_time_control', g.live_time_control,
          'rated', g.rated,
          'play_context', g.play_context,
          'source_type', g.source_type,
          -- Lightweight replay signal: this RPC only returns finished games.
          'public_replay', true
        )
        order by g.finished_at desc nulls last, g.created_at desc
      )
      from (
        select *
        from public.games
        where status = 'finished'
          and (white_player_id = p_profile_id or black_player_id = p_profile_id)
        order by finished_at desc nulls last, created_at desc
        limit v_limit
      ) g
      left join public.profiles opp
        on opp.id = case
          when g.white_player_id = p_profile_id then g.black_player_id
          else g.white_player_id
        end
    ),
    '[]'::jsonb
  );
end;
$$;

comment on function public.get_public_profile_history(uuid, integer) is
  'Privacy-scoped public finished-game timeline for profile pages. Curated fields only. Includes public replay availability signal.';

revoke all on function public.get_public_profile_history(uuid, integer) from public;
grant execute on function public.get_public_profile_history(uuid, integer) to anon, authenticated;

