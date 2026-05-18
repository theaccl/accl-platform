-- Realtime delivers postgres_changes only when the subscriber can SELECT the new row.
-- The prior policy only allowed game_player messages when games.status = 'finished', so
-- in-play / waiting table chat was invisible to the client → no events (users relied on polling).
-- This aligns RLS with lib/chat canAccessPlayerChat: seated participants, finished or in-play
-- (live, daily, correspondence) with no cross-channel or cross-game broadening.

drop policy if exists tester_chat_messages_game_player_select on public.tester_chat_messages;
create policy tester_chat_messages_game_player_select
  on public.tester_chat_messages
  for select
  to authenticated
  using (
    channel = 'game_player'
    and game_id is not null
    and exists (
      select 1
      from public.games g
      where g.id = tester_chat_messages.game_id
        and (g.white_player_id = auth.uid() or (g.black_player_id is not null and g.black_player_id = auth.uid()))
        and (
          lower(trim(coalesce(g.status::text, ''))) = 'finished'
          or (
            lower(trim(coalesce(g.status::text, ''))) in ('active', 'waiting')
            and (
              lower(trim(coalesce(g.tempo::text, ''))) = 'live'
              or lower(trim(coalesce(g.tempo::text, ''))) in ('daily', 'correspondence')
            )
          )
        )
    )
  );

comment on policy tester_chat_messages_game_player_select on public.tester_chat_messages is
  'Seated players read game_player rows for in-play (active/waiting) and post-game, matching canAccessPlayerChat.';
