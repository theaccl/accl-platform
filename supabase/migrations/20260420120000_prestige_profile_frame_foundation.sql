-- Prestige / frame foundation (storage + read-only profile access).
-- This migration does NOT implement prestige award or frame-evolution rules.

create table if not exists public.prestige_profile_frames (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  current_tier text not null
    constraint prestige_profile_frames_current_tier_not_blank check (btrim(current_tier) <> ''),
  frame_name text not null
    constraint prestige_profile_frames_frame_name_not_blank check (btrim(frame_name) <> ''),
  motif_family text not null
    constraint prestige_profile_frames_motif_family_not_blank check (btrim(motif_family) <> ''),
  accent_tier text not null
    constraint prestige_profile_frames_accent_tier_not_blank check (btrim(accent_tier) <> ''),
  source_basis jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.prestige_profile_frames is
  'Persisted prestige/frame state for profile visuals. Award/evolution policy is deferred.';

comment on column public.prestige_profile_frames.source_basis is
  'Structured basis inputs (ratings/trophies/relics/tournament results) used by future prestige logic.';

create unique index if not exists prestige_profile_frames_user_uidx
  on public.prestige_profile_frames (user_id);

create index if not exists prestige_profile_frames_updated_idx
  on public.prestige_profile_frames (updated_at desc);

alter table public.prestige_profile_frames enable row level security;

drop policy if exists "prestige_profile_frames_select_own" on public.prestige_profile_frames;

create policy "prestige_profile_frames_select_own"
  on public.prestige_profile_frames
  for select
  to authenticated
  using (auth.uid() = user_id);

grant select on public.prestige_profile_frames to authenticated;

revoke insert, update, delete on table public.prestige_profile_frames from authenticated;
revoke insert, update, delete on table public.prestige_profile_frames from anon;
revoke insert, update, delete on table public.prestige_profile_frames from public;
