-- Realtime delivery for game_spectator / game_player rows requires authenticated SELECT
-- on tester_chat_messages (Supabase Realtime respects RLS).

-- Spectator chat (live games): participants always; other viewers use same visibility
-- as get_public_spectate_game_snapshot for that game/ecosystem.
create or replace function public.realtime_can_read_game_spectator_chat(p_game_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  g public.games%rowtype;
  eco text;
begin
  if p_game_id is null or auth.uid() is null then
    return false;
  end if;

  select * into g from public.games where id = p_game_id;
  if not found then
    return false;
  end if;

  if lower(trim(coalesce(g.tempo, ''))) <> 'live' then
    return false;
  end if;

  if g.white_player_id = auth.uid() or (g.black_player_id is not null and g.black_player_id = auth.uid()) then
    return true;
  end if;

  eco := coalesce(nullif(trim(g.ecosystem_scope), ''), 'adult');
  return public.get_public_spectate_game_snapshot(p_game_id, eco) is not null;
end;
$$;

comment on function public.realtime_can_read_game_spectator_chat(uuid) is
  'RLS helper for tester_chat_messages game_spectator realtime; mirrors public spectate availability + participants.';

revoke all on function public.realtime_can_read_game_spectator_chat(uuid) from public;
grant execute on function public.realtime_can_read_game_spectator_chat(uuid) to authenticated;

drop policy if exists tester_chat_messages_game_spectator_select on public.tester_chat_messages;
create policy tester_chat_messages_game_spectator_select
  on public.tester_chat_messages
  for select
  to authenticated
  using (
    channel = 'game_spectator'
    and game_id is not null
    and public.realtime_can_read_game_spectator_chat(game_id)
  );

-- Post-game player-only channel: both players can read (API: finished + participant).
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
        and g.status = 'finished'
        and (
          g.white_player_id = auth.uid()
          or (g.black_player_id is not null and g.black_player_id = auth.uid())
        )
    )
  );
