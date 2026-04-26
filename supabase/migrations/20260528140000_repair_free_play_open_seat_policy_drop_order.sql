-- Idempotent repair if an older version of 20260527120000 attempted DROP FUNCTION (uuid)
-- before DROP POLICY, which fails on Postgres and can leave the DB on the legacy policy.
-- Requires the 4-arg auth_free_play_blocks_new_open_seat from 20260527120000 (create or replace there).

drop policy if exists "games_authenticated_insert_free_open_seat" on public.games;
drop function if exists public.auth_free_play_blocks_new_open_seat(uuid);

create policy "games_authenticated_insert_free_open_seat"
  on public.games
  for insert
  to authenticated
  with check (
    play_context = 'free'
    and tournament_id is null
    and white_player_id = (select auth.uid())
    and black_player_id is null
    and coalesce(status, '') in ('active', 'waiting')
    and not public.auth_free_play_blocks_new_open_seat(
      (select auth.uid()),
      coalesce(tempo, ''),
      coalesce(live_time_control, ''),
      coalesce(rated, false)
    )
  );

comment on policy "games_authenticated_insert_free_open_seat" on public.games is
  'Free-play open seat insert: slot-scoped; repair migration ensures policy not bound to legacy 1-arg fn.';
