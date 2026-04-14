-- Allow authenticated users to discover other users' free open seats so Find Match can join
-- (RPC create_seated_game_guard seats black). Participant-only SELECT blocked pairing in E2E.

drop policy if exists "games_authenticated_select_free_open_seat_for_join" on public.games;

create policy "games_authenticated_select_free_open_seat_for_join"
  on public.games
  for select
  to authenticated
  using (
    play_context = 'free'
    and tournament_id is null
    and coalesce(status, '') in ('active', 'waiting')
    and black_player_id is null
    and white_player_id is distinct from (select auth.uid())
  );

comment on policy "games_authenticated_select_free_open_seat_for_join" on public.games is
  'Join discovery: read minimal open-seat rows where White is another user so Find Match can call create_seated_game_guard.';
