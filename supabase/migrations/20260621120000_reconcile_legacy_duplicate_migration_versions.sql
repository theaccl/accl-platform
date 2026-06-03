-- Forward-only reconciliation for legacy duplicate Supabase migration version prefixes.
-- Supabase records one schema_migrations row per 14-digit version; a second file sharing the
-- same prefix may be skipped on fresh CLI bootstrap even though production effects were
-- applied manually or via the first file only.
--
-- Frozen duplicate groups (do not rename historical files):
--   20260425120000
--     20260425120000_editable_profile_identity.sql
--     20260425120000_expand_match_requests_live_time_control_check.sql
--   20260519120000
--     20260519120000_realtime_tester_chat_dm.sql
--     20260519120000_tester_bug_reports_game_context.sql
--   20260530140000
--     20260530140000_apply_move_transactional_move_log.sql
--     20260530140000_supabase_security_advisor_remaining_red.sql
--
-- Production notes (read-only evidence):
--   20260425120000 ledger recorded; match_requests constraint and profile identity exist.
--   20260519120000 ledger absent; chat realtime + bug-report column exist; game_id index missing.
--   20260530140000 ledger absent; move JSONB overload + public_growth_events RLS exist.
--
-- This migration forward-reconciles safe skipped effects only. It does NOT replay:
--   - supabase_realtime publication membership (unsafe on replay)
--   - apply_move_and_maybe_finish_system rewrites
--   - profile identity RPC changes
--   - Rated Daily Phase A objects (20260622140000)
--
-- ACCL_LEGACY_DUPLICATE_MIGRATION_VERSIONS_FROZEN

begin;

-- ---------------------------------------------------------------------------
-- 5A) 20260425120000 — skipped second file: match_requests live_time_control allowlist
-- Canonical allowlist from 20260619150000_accl_official_time_control_parity.sql
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.match_requests'::regclass
      and conname = 'match_requests_live_time_control_check'
  ) then
    alter table public.match_requests drop constraint match_requests_live_time_control_check;
  end if;
end $$;

alter table public.match_requests
  add constraint match_requests_live_time_control_check check (
    live_time_control is null
    or btrim(live_time_control) = ''
    or lower(btrim(live_time_control)) in (
      '1m', '1+1', '2m', '2+0', '2+1',
      '3m', '3+2', '5m', '5+5', '5m+5',
      '10m', '15m', '20m', '30m', '60m',
      '1d', '2d', '3d', '5d', '7d',
      '5m+3s'
    )
  );

comment on constraint match_requests_live_time_control_check on public.match_requests is
  'Reconciled allowlist (20260621120000). Sync with lib/acclTimeControls.ts.';

-- ---------------------------------------------------------------------------
-- 5B) 20260519120000 — skipped second file: tester_bug_reports game context + index
-- ---------------------------------------------------------------------------

alter table public.tester_bug_reports
  add column if not exists game_id uuid references public.games (id) on delete set null;

create index if not exists tester_bug_reports_game_id_idx
  on public.tester_bug_reports (game_id)
  where game_id is not null;

update public.tester_bug_reports
set category = 'cheating_concern'
where category = 'suspicious';

update public.tester_bug_reports
set category = 'ui_issue'
where category = 'ux';

update public.tester_bug_reports
set category = 'other'
where category = 'suggestion';

alter table public.tester_bug_reports
  drop constraint if exists tester_bug_reports_category_check;

alter table public.tester_bug_reports
  add constraint tester_bug_reports_category_check
  check (
    category is null
    or category in (
      'bug',
      'confusion',
      'match_issue',
      'ui_issue',
      'cheating_concern',
      'other'
    )
  );

-- ---------------------------------------------------------------------------
-- 5C) 20260530140000 — skipped second file: public_growth_events RLS hardening
-- ---------------------------------------------------------------------------

alter table public.public_growth_events enable row level security;

revoke all on table public.public_growth_events from public;
revoke all on table public.public_growth_events from anon;
revoke all on table public.public_growth_events from authenticated;

grant all on table public.public_growth_events to service_role;

drop policy if exists public_growth_events_deny_authenticated on public.public_growth_events;
create policy public_growth_events_deny_authenticated
  on public.public_growth_events
  for all
  to authenticated
  using (false)
  with check (false);

drop policy if exists public_growth_events_deny_anon on public.public_growth_events;
create policy public_growth_events_deny_anon
  on public.public_growth_events
  for all
  to anon
  using (false)
  with check (false);

drop policy if exists public_growth_events_service_role_all on public.public_growth_events;
create policy public_growth_events_service_role_all
  on public.public_growth_events
  for all
  to service_role
  using (true)
  with check (true);

commit;
