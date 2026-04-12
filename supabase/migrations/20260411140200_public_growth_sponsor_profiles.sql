-- Phase 26 — lightweight growth logging + optional sponsor fields + profile attribution (no payment logic).

create table if not exists public.public_growth_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_type text not null,
  entry_source text,
  referral_id text,
  conversion_step text,
  ecosystem text,
  user_id uuid references auth.users (id) on delete set null,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists public_growth_events_created_at_idx on public.public_growth_events (created_at desc);
create index if not exists public_growth_events_event_type_idx on public.public_growth_events (event_type);

comment on table public.public_growth_events is
  'Lightweight funnel/growth signals — no heavy analytics; optional user_id when session known.';

alter table public.tournaments
  add column if not exists sponsor_tag text,
  add column if not exists sponsor_label text;

comment on column public.tournaments.sponsor_tag is 'Optional sponsor slug for display (adult ecosystem only in UI).';
comment on column public.tournaments.sponsor_label is 'Optional short sponsor line (adult ecosystem only in UI).';

alter table public.profiles
  add column if not exists referral_id text,
  add column if not exists entry_source text,
  add column if not exists conversion_event text;

comment on column public.profiles.referral_id is 'First-touch referral code from ?ref (stored on signup attach).';
comment on column public.profiles.entry_source is 'Coarse entry: landing | share | direct | spectate | other.';
comment on column public.profiles.conversion_event is 'Last recorded conversion milestone (minimal string).';
