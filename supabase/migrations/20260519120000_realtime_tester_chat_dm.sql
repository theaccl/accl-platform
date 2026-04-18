-- Enable Supabase Realtime for DM delivery: clients use postgres_changes on INSERT.
-- RLS was service_role-only; authenticated users need SELECT on rows in their DM threads
-- so Realtime can deliver events (Realtime respects RLS).

do $pub$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table public.tester_chat_messages';
    exception
      when duplicate_object then null;
    end;
  end if;
end $pub$;

drop policy if exists tester_chat_messages_dm_select_thread_participant on public.tester_chat_messages;
create policy tester_chat_messages_dm_select_thread_participant
  on public.tester_chat_messages
  for select
  to authenticated
  using (
    channel = 'dm'
    and dm_thread_id is not null
    and exists (
      select 1
      from public.tester_dm_threads t
      where t.id = tester_chat_messages.dm_thread_id
        and (t.participant_low = auth.uid() or t.participant_high = auth.uid())
    )
  );

comment on policy tester_chat_messages_dm_select_thread_participant on public.tester_chat_messages is
  'Allows DM thread participants to receive Realtime postgres_changes; full chat rules remain in API routes.';
