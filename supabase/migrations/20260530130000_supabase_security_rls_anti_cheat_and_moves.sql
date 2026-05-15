-- Security Advisor follow-up: RLS + grants for anti-cheat enforcement tables and legacy public.moves.
-- App audit (2026-05): enforcementStore + moderator enforcement routes use createServiceRoleClient only.
-- No .from('moves') in TS/TSX; live move history uses public.game_move_logs.

-- ---------------------------------------------------------------------------
-- anti_cheat_enforcement_states — service_role only (moderator + analysis pipeline)
-- ---------------------------------------------------------------------------

alter table public.anti_cheat_enforcement_states enable row level security;

revoke all on table public.anti_cheat_enforcement_states from public;
revoke all on table public.anti_cheat_enforcement_states from anon;
revoke all on table public.anti_cheat_enforcement_states from authenticated;

grant all on table public.anti_cheat_enforcement_states to service_role;

drop policy if exists anti_cheat_enforcement_states_deny_authenticated on public.anti_cheat_enforcement_states;
create policy anti_cheat_enforcement_states_deny_authenticated
  on public.anti_cheat_enforcement_states
  for all
  to authenticated
  using (false)
  with check (false);

drop policy if exists anti_cheat_enforcement_states_deny_anon on public.anti_cheat_enforcement_states;
create policy anti_cheat_enforcement_states_deny_anon
  on public.anti_cheat_enforcement_states
  for all
  to anon
  using (false)
  with check (false);

drop policy if exists anti_cheat_enforcement_states_service_role_all on public.anti_cheat_enforcement_states;
create policy anti_cheat_enforcement_states_service_role_all
  on public.anti_cheat_enforcement_states
  for all
  to service_role
  using (true)
  with check (true);

comment on policy anti_cheat_enforcement_states_service_role_all on public.anti_cheat_enforcement_states is
  'Enforcement baselines written by server analysis/moderator APIs (SupabaseAntiCheatEnforcementStore); not exposed to browser clients.';

-- ---------------------------------------------------------------------------
-- anti_cheat_enforcement_override_history — service_role only (append-only audit)
-- ---------------------------------------------------------------------------

alter table public.anti_cheat_enforcement_override_history enable row level security;

revoke all on table public.anti_cheat_enforcement_override_history from public;
revoke all on table public.anti_cheat_enforcement_override_history from anon;
revoke all on table public.anti_cheat_enforcement_override_history from authenticated;

grant all on table public.anti_cheat_enforcement_override_history to service_role;

drop policy if exists anti_cheat_enforcement_override_history_deny_authenticated on public.anti_cheat_enforcement_override_history;
create policy anti_cheat_enforcement_override_history_deny_authenticated
  on public.anti_cheat_enforcement_override_history
  for all
  to authenticated
  using (false)
  with check (false);

drop policy if exists anti_cheat_enforcement_override_history_deny_anon on public.anti_cheat_enforcement_override_history;
create policy anti_cheat_enforcement_override_history_deny_anon
  on public.anti_cheat_enforcement_override_history
  for all
  to anon
  using (false)
  with check (false);

drop policy if exists anti_cheat_enforcement_override_history_service_role_all on public.anti_cheat_enforcement_override_history;
create policy anti_cheat_enforcement_override_history_service_role_all
  on public.anti_cheat_enforcement_override_history
  for all
  to service_role
  using (true)
  with check (true);

comment on policy anti_cheat_enforcement_override_history_service_role_all on public.anti_cheat_enforcement_override_history is
  'Moderator override audit trail; read via /api/moderator/enforcement/*/history with service role.';

-- ---------------------------------------------------------------------------
-- public.moves — legacy table (not in repo migrations); service_role only if present
-- ---------------------------------------------------------------------------
-- Canonical move history is public.game_move_logs (RLS in 20260401120000_game_move_logs.sql).
-- No application .from(''moves'') usage found; lock down to satisfy Security Advisor without
-- changing gameplay (submit-move uses game_move_logs + RPCs).

do $$
begin
  if to_regclass('public.moves') is null then
    raise notice 'public.moves not present — skipping RLS hardening block';
    return;
  end if;

  execute 'alter table public.moves enable row level security';

  execute 'revoke all on table public.moves from public';
  execute 'revoke all on table public.moves from anon';
  execute 'revoke all on table public.moves from authenticated';

  execute 'grant all on table public.moves to service_role';

  execute 'drop policy if exists moves_deny_authenticated on public.moves';
  execute $pol$
    create policy moves_deny_authenticated
      on public.moves
      for all
      to authenticated
      using (false)
      with check (false)
  $pol$;

  execute 'drop policy if exists moves_deny_anon on public.moves';
  execute $pol$
    create policy moves_deny_anon
      on public.moves
      for all
      to anon
      using (false)
      with check (false)
  $pol$;

  execute 'drop policy if exists moves_service_role_all on public.moves';
  execute $pol$
    create policy moves_service_role_all
      on public.moves
      for all
      to service_role
      using (true)
      with check (true)
  $pol$;

  execute $cmt$
    comment on policy moves_service_role_all on public.moves is
      'Legacy moves table — unused by current app (game_move_logs is source of truth). service_role only.'
  $cmt$;
end $$;
