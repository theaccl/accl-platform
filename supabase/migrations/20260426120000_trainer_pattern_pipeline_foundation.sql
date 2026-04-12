-- Phase 4 foundation: player pattern profiles + generated trainer positions.

create table if not exists public.player_pattern_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  pattern_tags jsonb not null default '[]'::jsonb,
  suggested_themes jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.player_pattern_profiles enable row level security;

drop policy if exists "player_pattern_profiles_self_select" on public.player_pattern_profiles;
create policy "player_pattern_profiles_self_select"
on public.player_pattern_profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "player_pattern_profiles_service_role_write" on public.player_pattern_profiles;
create policy "player_pattern_profiles_service_role_write"
on public.player_pattern_profiles
for all
to service_role
using (true)
with check (true);

create table if not exists public.trainer_generated_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_game_id uuid not null references public.games(id) on delete cascade,
  fen text not null,
  theme text not null,
  difficulty text not null default 'normal',
  status text not null default 'approved',
  created_at timestamptz not null default now()
);

create index if not exists idx_trainer_generated_positions_user_created
  on public.trainer_generated_positions (user_id, created_at desc);

alter table public.trainer_generated_positions enable row level security;

drop policy if exists "trainer_generated_positions_self_select" on public.trainer_generated_positions;
create policy "trainer_generated_positions_self_select"
on public.trainer_generated_positions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "trainer_generated_positions_service_role_write" on public.trainer_generated_positions;
create policy "trainer_generated_positions_service_role_write"
on public.trainer_generated_positions
for all
to service_role
using (true)
with check (true);
