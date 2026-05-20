-- Phase 1 live launch attendance: check-in / presence before initial bracket spawn only.

alter table public.tournament_entries
  add column if not exists checked_in_at timestamptz null,
  add column if not exists last_seen_at timestamptz null,
  add column if not exists entry_role text not null default 'entrant',
  add column if not exists launch_skip_reason text null;

alter table public.tournament_entries
  drop constraint if exists tournament_entries_entry_role_check;

alter table public.tournament_entries
  add constraint tournament_entries_entry_role_check
  check (entry_role in ('entrant', 'standby'));

comment on column public.tournament_entries.checked_in_at is
  'Explicit “I am here” for live tournament launch (pre-bracket only).';
comment on column public.tournament_entries.last_seen_at is
  'Last tournament page/context heartbeat for launch presence.';
comment on column public.tournament_entries.entry_role is
  'entrant = bracket field; standby = launch replacement pool.';
comment on column public.tournament_entries.launch_skip_reason is
  'Set when entrant is excluded at live launch (absent / replaced).';

alter table public.tournaments
  add column if not exists launch_scheduled_at timestamptz null;

comment on column public.tournaments.launch_scheduled_at is
  'Live launch countdown target (UTC). Informational gate before bootstrap; not auto-cron.';
