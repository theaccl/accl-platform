-- Phase 1 scheduled-start verification: represent planned start time only.
-- No cron, no auto-bootstrap, no auto-forfeit — enforcement deferred to product phase.

alter table public.tournaments
  add column if not exists starts_at timestamptz null;

comment on column public.tournaments.starts_at is
  'Optional scheduled start (UTC). Informational for ops/UI; bracket bootstrap remains explicit until a later phase enforces timing.';

create index if not exists tournaments_starts_at_status_idx
  on public.tournaments (starts_at)
  where starts_at is not null and status in ('pending', 'active');
