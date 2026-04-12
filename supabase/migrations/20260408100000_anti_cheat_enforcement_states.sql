create table if not exists public.anti_cheat_enforcement_states (
  user_id uuid primary key,
  enforcement_state text not null,
  source_suspicion_tier text not null,
  source_recommended_action text not null,
  source_reason_json jsonb not null default '[]'::jsonb,
  override_action text null,
  override_state text null,
  override_reason text null,
  override_expires_at timestamptz null,
  override_set_by uuid null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_anti_cheat_enforcement_state_updated_at
  on public.anti_cheat_enforcement_states (updated_at desc);
