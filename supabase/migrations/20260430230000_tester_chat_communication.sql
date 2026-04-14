-- Tester-phase ACCL chat: persisted, attributable messages with moderation hooks.
-- Access is enforced in Next.js API routes using the service role (not client-side RLS).

create table if not exists public.tester_dm_threads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  participant_low uuid not null references public.profiles (id) on delete cascade,
  participant_high uuid not null references public.profiles (id) on delete cascade,
  constraint tester_dm_ordered check (participant_low::text < participant_high::text),
  constraint tester_dm_unique_pair unique (participant_low, participant_high)
);

create index if not exists tester_dm_threads_participant_low_idx
  on public.tester_dm_threads (participant_low);

create index if not exists tester_dm_threads_participant_high_idx
  on public.tester_dm_threads (participant_high);

create table if not exists public.tester_chat_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  channel text not null
    check (channel in ('game_spectator', 'game_player', 'lobby', 'dm')),
  game_id uuid references public.games (id) on delete cascade,
  lobby_room text,
  dm_thread_id uuid references public.tester_dm_threads (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  constraint tester_chat_body_len check (char_length(trim(body)) between 1 and 2000),
  constraint tester_chat_scope check (
    (
      channel = 'game_spectator'
      and game_id is not null
      and lobby_room is null
      and dm_thread_id is null
    )
    or (
      channel = 'game_player'
      and game_id is not null
      and lobby_room is null
      and dm_thread_id is null
    )
    or (
      channel = 'lobby'
      and game_id is null
      and lobby_room is not null
      and dm_thread_id is null
    )
    or (
      channel = 'dm'
      and game_id is null
      and lobby_room is null
      and dm_thread_id is not null
    )
  )
);

create index if not exists tester_chat_messages_game_channel_created_idx
  on public.tester_chat_messages (game_id, channel, created_at desc);

create index if not exists tester_chat_messages_lobby_created_idx
  on public.tester_chat_messages (lobby_room, created_at desc)
  where channel = 'lobby';

create index if not exists tester_chat_messages_dm_thread_created_idx
  on public.tester_chat_messages (dm_thread_id, created_at desc)
  where channel = 'dm';

create index if not exists tester_chat_messages_sender_created_idx
  on public.tester_chat_messages (sender_id, created_at desc);

create table if not exists public.tester_chat_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  message_id uuid not null references public.tester_chat_messages (id) on delete cascade,
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  reason text,
  constraint tester_chat_reports_unique unique (message_id, reporter_id)
);

create index if not exists tester_chat_reports_created_idx
  on public.tester_chat_reports (created_at desc);

create table if not exists public.tester_chat_mutes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  muter_id uuid not null references public.profiles (id) on delete cascade,
  muted_user_id uuid not null references public.profiles (id) on delete cascade,
  constraint tester_chat_mutes_unique unique (muter_id, muted_user_id),
  constraint tester_chat_mutes_no_self check (muter_id is distinct from muted_user_id)
);

create table if not exists public.tester_chat_blocks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_user_id uuid not null references public.profiles (id) on delete cascade,
  constraint tester_chat_blocks_unique unique (blocker_id, blocked_user_id),
  constraint tester_chat_blocks_no_self check (blocker_id is distinct from blocked_user_id)
);

alter table public.tester_dm_threads enable row level security;
alter table public.tester_chat_messages enable row level security;
alter table public.tester_chat_reports enable row level security;
alter table public.tester_chat_mutes enable row level security;
alter table public.tester_chat_blocks enable row level security;

-- Deny-by-default; API uses service_role only for these tables.
drop policy if exists tester_dm_threads_service_all on public.tester_dm_threads;
create policy tester_dm_threads_service_all
  on public.tester_dm_threads
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists tester_chat_messages_service_all on public.tester_chat_messages;
create policy tester_chat_messages_service_all
  on public.tester_chat_messages
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists tester_chat_reports_service_all on public.tester_chat_reports;
create policy tester_chat_reports_service_all
  on public.tester_chat_reports
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists tester_chat_mutes_service_all on public.tester_chat_mutes;
create policy tester_chat_mutes_service_all
  on public.tester_chat_mutes
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists tester_chat_blocks_service_all on public.tester_chat_blocks;
create policy tester_chat_blocks_service_all
  on public.tester_chat_blocks
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.tester_chat_messages is
  'Tester-phase chat; channel separation and auth enforced in application layer.';
