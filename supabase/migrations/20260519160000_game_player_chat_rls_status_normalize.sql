-- game_player Realtime was blocked for some recipients when games.status casing did not
-- match the literal 'finished' (UI/API use case-insensitive finished checks).

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
        and lower(trim(coalesce(g.status::text, ''))) = 'finished'
        and (
          g.white_player_id = auth.uid()
          or (g.black_player_id is not null and g.black_player_id = auth.uid())
        )
    )
  );
