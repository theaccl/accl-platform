-- Final Security Advisor RED cleanup (two objects only).
-- Does not change gameplay, chat, tournament, trainer, or lobby policies.

-- ---------------------------------------------------------------------------
-- public.moderator_role_audit_history — service_role-only audit (moderator admin)
-- Writes: set_moderator_role_binding (service_role). Reads: server APIs only.
-- ---------------------------------------------------------------------------

alter table public.moderator_role_audit_history enable row level security;

revoke all on table public.moderator_role_audit_history from public;
revoke all on table public.moderator_role_audit_history from anon;
revoke all on table public.moderator_role_audit_history from authenticated;

grant all on table public.moderator_role_audit_history to service_role;

drop policy if exists moderator_role_audit_history_deny_authenticated on public.moderator_role_audit_history;
create policy moderator_role_audit_history_deny_authenticated
  on public.moderator_role_audit_history
  for all
  to authenticated
  using (false)
  with check (false);

drop policy if exists moderator_role_audit_history_deny_anon on public.moderator_role_audit_history;
create policy moderator_role_audit_history_deny_anon
  on public.moderator_role_audit_history
  for all
  to anon
  using (false)
  with check (false);

drop policy if exists moderator_role_audit_history_service_role_full_access on public.moderator_role_audit_history;
create policy moderator_role_audit_history_service_role_full_access
  on public.moderator_role_audit_history
  for all
  to service_role
  using (true)
  with check (true);

comment on policy moderator_role_audit_history_service_role_full_access on public.moderator_role_audit_history is
  'Moderator role grant/revoke audit; written by set_moderator_role_binding. No authenticated PostgREST access.';

-- ---------------------------------------------------------------------------
-- public.games_with_usernames — legacy manual view (unused in repo)
-- Current app loads public.games + public.profiles (or RPCs) separately.
-- Revoke client roles, then drop view to clear SECURITY DEFINER exposure.
-- ---------------------------------------------------------------------------

do $$
begin
  if to_regclass('public.games_with_usernames') is null then
    raise notice 'public.games_with_usernames not present — skipping legacy view cleanup';
    return;
  end if;

  execute $cmt$
    comment on view public.games_with_usernames is
      'LEGACY (unused in app): games joined to profile usernames. Dropped after revoke; use games + profiles or spectate RPCs.'
  $cmt$;

  execute 'revoke all on public.games_with_usernames from public';
  execute 'revoke all on public.games_with_usernames from anon';
  execute 'revoke all on public.games_with_usernames from authenticated';

  execute 'grant select on public.games_with_usernames to service_role';

  execute 'drop view public.games_with_usernames';
end $$;
