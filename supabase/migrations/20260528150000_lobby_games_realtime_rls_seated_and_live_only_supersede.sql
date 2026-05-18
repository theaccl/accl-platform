-- 1) Realtime + RLS: postgres_changes is only delivered when the subscriber can SELECT the new row
--    (see 20260523120000 for the same issue on lobby chat). Join discovery allows only open seats
--    (black null); when black is seated, the row is no longer visible to third parties, so they
--    never receive the UPDATE and lobby indicators stay stale until a full reload.
-- 2) Supersede: `invalidateLiveQueueAvailabilityForUsers` and create_seated_game_guard must void only
--    *live* waiting rows; daily / correspondence open seats should survive live activation.

drop policy if exists "games_authenticated_select_free_lobby_seated_for_realtime" on public.games;

create policy "games_authenticated_select_free_lobby_seated_for_realtime"
  on public.games
  for select
  to authenticated
  using (
    play_context = 'free'
    and tournament_id is null
    and coalesce(status, '') in ('active', 'waiting')
    and white_player_id is not null
    and black_player_id is not null
  );

comment on policy "games_authenticated_select_free_lobby_seated_for_realtime" on public.games is
  'Lobby/Realtime: seated free games are readable to any authenticated user so open→seated updates reach all lobby clients. Watch/spectate lists stay API-sourced for labels; this matches chat lobby SELECT in 20260523120000.';

create or replace function public.supersede_stale_free_open_seats_for_users(
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
    where play_context = 'free'
      and tournament_id is null
      and status in ('active', 'waiting')
      and coalesce(tempo, '') = 'live'
      and black_player_id is null
      and white_player_id is not null
      and white_player_id in (p_user_a, p_user_b)
      and (p_exclude_game_id is null or id is distinct from p_exclude_game_id)
    order by created_at asc
    for update
  loop
    perform public.finish_game_system(r.id, 'draw', 'superseded');
  end loop;
end;
$$;

revoke all on function public.supersede_stale_free_open_seats_for_users(uuid, uuid, uuid) from public;
