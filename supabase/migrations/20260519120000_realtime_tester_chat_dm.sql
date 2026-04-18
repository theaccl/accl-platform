-- ============================================
-- ACCL: ENABLE REALTIME + RLS FOR DM CHAT
-- ============================================

-- 1. Add table to realtime publication (safe if already exists)
alter publication supabase_realtime add table public.tester_chat_messages;

-- 2. Enable RLS (safe if already enabled)
alter table public.tester_chat_messages enable row level security;

-- 3. Allow authenticated users to read ONLY their DM messages
create policy tester_chat_messages_dm_select_thread_participant
on public.tester_chat_messages
for select
to authenticated
using (
  channel = 'dm'
  and exists (
    select 1
    from public.tester_dm_threads t
    where t.id = tester_chat_messages.dm_thread_id
      and (
        t.participant_low = auth.uid()
        or t.participant_high = auth.uid()
      )
  )
);
