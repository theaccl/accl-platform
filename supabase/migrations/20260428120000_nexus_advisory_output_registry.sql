-- NEXUS advisory-output registry (advisory-only intelligence records).
-- This table is intentionally separated from authoritative game/tournament truth tables.

create table if not exists public.nexus_advisory_outputs (
  id uuid primary key default gen_random_uuid(),
  output_type text not null check (output_type in ('insight', 'warning', 'recommendation', 'anomaly_flag')),
  subject_scope text not null check (subject_scope in ('player', 'game', 'system', 'moderation')),
  subject_id text null,
  confidence numeric(5,4) not null check (confidence >= 0 and confidence <= 1),
  source_refs jsonb not null,
  content jsonb not null,
  model_version text not null check (btrim(model_version) <> ''),
  policy_version text not null check (btrim(policy_version) <> ''),
  generated_at timestamptz not null,
  expires_at timestamptz null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_nexus_outputs_scope_generated
  on public.nexus_advisory_outputs (subject_scope, generated_at desc);

create index if not exists idx_nexus_outputs_subject_generated
  on public.nexus_advisory_outputs (subject_id, generated_at desc)
  where subject_id is not null;

create index if not exists idx_nexus_outputs_type_generated
  on public.nexus_advisory_outputs (output_type, generated_at desc);

create index if not exists idx_nexus_outputs_expiry
  on public.nexus_advisory_outputs (expires_at, generated_at desc);

alter table public.nexus_advisory_outputs enable row level security;

revoke all on public.nexus_advisory_outputs from public;
grant select, insert on public.nexus_advisory_outputs to service_role;

