-- Security Advisor (Splinter) follow-up: ERROR-level `rls_disabled_in_public` on growth funnel table.
-- Ingestion path: app/api/public/growth-event/route.ts uses createServiceRoleClient only (no browser PostgREST access).

-- ---------------------------------------------------------------------------
-- public.public_growth_events — service_role only
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

comment on policy public_growth_events_service_role_all on public.public_growth_events is
  'Growth funnel rows inserted via POST /api/public/growth-event (service role); not exposed to anon/authenticated PostgREST.';
