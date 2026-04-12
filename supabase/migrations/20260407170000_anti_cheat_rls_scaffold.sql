-- Phase 5C scaffold: governance prep for anti_cheat_events.
-- Intentionally minimal: no broad auth rollout in this migration.

alter table public.anti_cheat_events enable row level security;

-- Service-role-only insert path (via Supabase service key / trusted server code).
-- This keeps client sessions from writing anti-cheat events directly.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'anti_cheat_events'
      and policyname = 'anti_cheat_events_service_insert_only'
  ) then
    create policy anti_cheat_events_service_insert_only
      on public.anti_cheat_events
      for insert
      to service_role
      with check (true);
  end if;
end
$$;

-- Future phase notes:
-- 1) Add moderator-read policy bound to a dedicated moderator role.
-- 2) Add audited RPC/view layer for scoped moderator access.
