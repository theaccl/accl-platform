-- Narrow supersede: only finish games that are *exactly* between the two users
-- (White/Black in either order). The previous logic matched any seated game where
-- either player appeared, which incorrectly ended unrelated active games (e.g. P1 vs P2
-- when P3 joined an open seat with P1).

create or replace function public.supersede_free_seated_games_for_pair(
  p_user_a uuid,
  p_user_b uuid,
  p_exclude_game_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select id
    from public.games
    where status = 'active'
      and play_context = 'free'
      and tournament_id is null
      and black_player_id is not null
      and (
        (white_player_id = p_user_a and black_player_id = p_user_b)
        or (white_player_id = p_user_b and black_player_id = p_user_a)
      )
      and (p_exclude_game_id is null or id is distinct from p_exclude_game_id)
    order by created_at asc
    for update
  loop
    perform public.finish_game_system(r.id, 'draw', 'superseded');
  end loop;
end;
$$;

revoke all on function public.supersede_free_seated_games_for_pair(uuid, uuid, uuid) from public;
