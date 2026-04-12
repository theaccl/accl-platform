-- Phase 21 — lightweight player connections (identity-level, no messaging).

create table if not exists public.player_connections (
  id uuid primary key default gen_random_uuid(),
  player_low uuid not null references auth.users (id) on delete cascade,
  player_high uuid not null references auth.users (id) on delete cascade,
  ecosystem_scope text not null check (ecosystem_scope in ('adult', 'k12')),
  requested_by uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'declined')) default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint player_connections_ordered_pair check (player_low < player_high),
  constraint player_connections_requester_is_member check (
    requested_by = player_low or requested_by = player_high
  ),
  constraint player_connections_unique_pair_eco unique (player_low, player_high, ecosystem_scope)
);

create index if not exists idx_player_connections_player_low
  on public.player_connections (player_low, ecosystem_scope, status);

create index if not exists idx_player_connections_player_high
  on public.player_connections (player_high, ecosystem_scope, status);

comment on table public.player_connections is
  'Optional mutual recognition links between players within an ecosystem scope; no messaging.';

alter table public.player_connections enable row level security;

-- App routes use service role; deny direct anon access.
create policy player_connections_deny_anon
  on public.player_connections
  for all
  to anon
  using (false)
  with check (false);

create policy player_connections_service_all
  on public.player_connections
  for all
  to service_role
  using (true)
  with check (true);
