create table if not exists public.anti_cheat_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  game_id uuid null,
  fen text null,
  overlap_verdict text not null,
  suspicion_score integer not null default 0,
  suspicion_tier text not null,
  reasons_json jsonb not null default '[]'::jsonb,
  protected_context boolean not null default false,
  engine_called boolean not null default false,
  request_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_anti_cheat_events_user_created_at
  on public.anti_cheat_events (user_id, created_at desc);

create index if not exists idx_anti_cheat_events_game_id
  on public.anti_cheat_events (game_id);
