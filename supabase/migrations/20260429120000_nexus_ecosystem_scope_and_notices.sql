-- Phase 4 (NEXUS): first-class ecosystem discrimination + dedicated notices/events sources.

-- 1) First-class ecosystem scope on core leaderboard/live sources.
alter table public.games
  add column if not exists ecosystem_scope text;

update public.games
set ecosystem_scope = case
  when lower(coalesce(source_type, '')) like '%k12%' then 'k12'
  else 'adult'
end
where ecosystem_scope is null;

alter table public.games
  alter column ecosystem_scope set default 'adult';

alter table public.games
  alter column ecosystem_scope set not null;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'games_ecosystem_scope_check'
      and conrelid = 'public.games'::regclass
  ) then
    alter table public.games drop constraint games_ecosystem_scope_check;
  end if;
end$$;

alter table public.games
  add constraint games_ecosystem_scope_check
  check (ecosystem_scope in ('adult', 'k12'));

create index if not exists games_ecosystem_scope_status_updated_idx
  on public.games (ecosystem_scope, status, updated_at desc);

comment on column public.games.ecosystem_scope is
  'First-class ecosystem discriminator. adult and k12 are isolated query domains.';

alter table public.tournaments
  add column if not exists ecosystem_scope text;

update public.tournaments
set ecosystem_scope = case
  when lower(coalesce(name, '')) like '%k12%' or lower(coalesce(name, '')) like '%k-12%' then 'k12'
  else 'adult'
end
where ecosystem_scope is null;

alter table public.tournaments
  alter column ecosystem_scope set default 'adult';

alter table public.tournaments
  alter column ecosystem_scope set not null;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'tournaments_ecosystem_scope_check'
      and conrelid = 'public.tournaments'::regclass
  ) then
    alter table public.tournaments drop constraint tournaments_ecosystem_scope_check;
  end if;
end$$;

alter table public.tournaments
  add constraint tournaments_ecosystem_scope_check
  check (ecosystem_scope in ('adult', 'k12'));

create index if not exists tournaments_ecosystem_scope_status_start_idx
  on public.tournaments (ecosystem_scope, status, created_at desc);

comment on column public.tournaments.ecosystem_scope is
  'First-class ecosystem discriminator. adult and k12 are isolated query domains.';

-- 2) Dedicated curated announcements source.
create table if not exists public.nexus_announcements (
  id uuid primary key default gen_random_uuid(),
  ecosystem_scope text not null check (ecosystem_scope in ('adult', 'k12')),
  title text not null,
  body text not null,
  is_active boolean not null default true,
  pinned boolean not null default false,
  starts_at timestamptz null,
  ends_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists nexus_announcements_scope_active_idx
  on public.nexus_announcements (ecosystem_scope, is_active, pinned desc, created_at desc);

alter table public.nexus_announcements enable row level security;

drop policy if exists nexus_announcements_select_authenticated on public.nexus_announcements;
create policy nexus_announcements_select_authenticated
  on public.nexus_announcements
  for select
  to authenticated
  using (is_active = true);

drop policy if exists nexus_announcements_service_all on public.nexus_announcements;
create policy nexus_announcements_service_all
  on public.nexus_announcements
  for all
  to service_role
  using (true)
  with check (true);

-- 3) Dedicated upcoming events source.
create table if not exists public.nexus_upcoming_events (
  id uuid primary key default gen_random_uuid(),
  ecosystem_scope text not null check (ecosystem_scope in ('adult', 'k12')),
  title text not null,
  event_type text not null,
  utc_start timestamptz not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists nexus_upcoming_events_scope_start_idx
  on public.nexus_upcoming_events (ecosystem_scope, is_active, utc_start asc);

alter table public.nexus_upcoming_events enable row level security;

drop policy if exists nexus_upcoming_events_select_authenticated on public.nexus_upcoming_events;
create policy nexus_upcoming_events_select_authenticated
  on public.nexus_upcoming_events
  for select
  to authenticated
  using (is_active = true);

drop policy if exists nexus_upcoming_events_service_all on public.nexus_upcoming_events;
create policy nexus_upcoming_events_service_all
  on public.nexus_upcoming_events
  for all
  to service_role
  using (true)
  with check (true);

-- Realtime visibility for live activity modules.
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.nexus_announcements';
  exception when duplicate_object then
    null;
  end;
  begin
    execute 'alter publication supabase_realtime add table public.nexus_upcoming_events';
  exception when duplicate_object then
    null;
  end;
end$$;

