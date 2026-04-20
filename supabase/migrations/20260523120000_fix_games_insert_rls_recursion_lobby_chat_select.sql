-- 1) games INSERT RLS: WITH CHECK referenced public.games inside a policy ON public.games,
--    which re-evaluates games RLS and triggers "infinite recursion detected in policy for relation games".
--    Open-queue SELECTs and PostgREST games reads hit the same policy graph and can 500.
--    Fix: move the EXISTS scan into SECURITY DEFINER (owner bypasses RLS on games).
--
-- 2) tester_chat_messages: authenticated Realtime delivery requires a matching SELECT policy.
--    DM / game_* policies existed; lobby had none, so other clients never received INSERT events.

create or replace function public.auth_free_play_blocks_new_open_seat(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.games g
    where g.play_context = 'free'
      and g.tournament_id is null
      and g.status in ('active', 'waiting')
      and (
        (
          g.white_player_id is not null
          and g.black_player_id is not null
          and (
            g.white_player_id = p_uid
            or g.black_player_id = p_uid
          )
        )
        or (
          g.white_player_id = p_uid
          and g.black_player_id is null
        )
      )
  );
$$;

comment on function public.auth_free_play_blocks_new_open_seat(uuid) is
  'True when user must not open another free open seat (already seated or has a waiting row). Used from games INSERT RLS to avoid self-referential policy subqueries.';

revoke all on function public.auth_free_play_blocks_new_open_seat(uuid) from public;
grant execute on function public.auth_free_play_blocks_new_open_seat(uuid) to authenticated;

drop policy if exists "games_authenticated_insert_free_open_seat" on public.games;

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
    and not public.auth_free_play_blocks_new_open_seat((select auth.uid()))
  );

comment on policy "games_authenticated_insert_free_open_seat" on public.games is
  'Free-play open seat: one waiting row per user; no new open seat while already in a full game. Uses SECURITY DEFINER helper to avoid RLS recursion.';

-- Lobby: allowlisted rooms only (mirrors lib/chat/chatChannels FREE_LOBBY_ROOMS + legacy global).
drop policy if exists tester_chat_messages_lobby_select_allowlisted on public.tester_chat_messages;
create policy tester_chat_messages_lobby_select_allowlisted
  on public.tester_chat_messages
  for select
  to authenticated
  using (
    channel = 'lobby'
    and lobby_room is not null
    and lobby_room in (
      'free_lobby_general',
      'free_lobby_bullet',
      'free_lobby_blitz',
      'free_lobby_rapid',
      'free_lobby_daily',
      'global'
    )
  );

comment on policy tester_chat_messages_lobby_select_allowlisted on public.tester_chat_messages is
  'Supabase Realtime + client reads: lobby rows in known free-play rooms (sends still go through API).';
