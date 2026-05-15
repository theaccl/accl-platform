-- Security clampdown: explicit grants, drop legacy permissive tournament policies,
-- match_requests + profiles RLS (were missing from repo migrations), payment ledger lockdown,
-- revoke tournament_bootstrap_round from authenticated (operator API uses service_role).

-- ---------------------------------------------------------------------------
-- 1) Tournaments: remove foundation-era permissive policies + tighten grants
-- ---------------------------------------------------------------------------

drop policy if exists "tournaments_update_authenticated" on public.tournaments;
drop policy if exists "tournament_entries_rw" on public.tournament_entries;
drop policy if exists "tournament_matches_rw" on public.tournament_matches;

revoke all on function public.tournament_bootstrap_round(uuid) from public;
revoke execute on function public.tournament_bootstrap_round(uuid) from authenticated;
revoke execute on function public.tournament_bootstrap_round(uuid) from anon;
grant execute on function public.tournament_bootstrap_round(uuid) to service_role;

revoke all on table public.tournaments from public;
revoke all on table public.tournament_entries from public;
revoke all on table public.tournament_matches from public;

revoke delete on table public.tournaments from authenticated;
revoke delete on table public.tournament_entries from authenticated;
revoke delete on table public.tournament_matches from authenticated;

grant select, insert, update on table public.tournaments to authenticated;
grant select, insert, update on table public.tournament_entries to authenticated;
grant select, insert, update on table public.tournament_matches to authenticated;

grant all on table public.tournaments to service_role;
grant all on table public.tournament_entries to service_role;
grant all on table public.tournament_matches to service_role;

-- ---------------------------------------------------------------------------
-- 2) match_requests: RLS + inbox/open-listing policies (client + accept route)
-- ---------------------------------------------------------------------------

alter table public.match_requests enable row level security;

revoke all on table public.match_requests from public;
revoke all on table public.match_requests from anon;

grant select, insert, update on table public.match_requests to authenticated;
grant all on table public.match_requests to service_role;

drop policy if exists match_requests_select_inbox on public.match_requests;
create policy match_requests_select_inbox
  on public.match_requests
  for select
  to authenticated
  using (
    from_user_id = (select auth.uid())
    or to_user_id = (select auth.uid())
    or (
      visibility = 'open'
      and status = 'pending'
      and from_user_id is distinct from (select auth.uid())
    )
  );

drop policy if exists match_requests_insert_sender on public.match_requests;
create policy match_requests_insert_sender
  on public.match_requests
  for insert
  to authenticated
  with check (from_user_id = (select auth.uid()));

drop policy if exists match_requests_update_recipient_pending on public.match_requests;
create policy match_requests_update_recipient_pending
  on public.match_requests
  for update
  to authenticated
  using (
    to_user_id = (select auth.uid())
    and status = 'pending'
  )
  with check (
    to_user_id = (select auth.uid())
  );

drop policy if exists match_requests_update_sender_pending on public.match_requests;
create policy match_requests_update_sender_pending
  on public.match_requests
  for update
  to authenticated
  using (
    from_user_id = (select auth.uid())
    and status = 'pending'
  )
  with check (
    from_user_id = (select auth.uid())
  );

drop policy if exists match_requests_service_role_all on public.match_requests;
create policy match_requests_service_role_all
  on public.match_requests
  for all
  to service_role
  using (true)
  with check (true);

comment on policy match_requests_select_inbox on public.match_requests is
  'Inbox: sender, recipient, or pending open listings (not own).';

-- ---------------------------------------------------------------------------
-- 3) profiles: enable RLS (idempotent); self write + authenticated lookup reads
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

revoke all on table public.profiles from public;
revoke all on table public.profiles from anon;

grant select, insert, update on table public.profiles to authenticated;
grant all on table public.profiles to service_role;

drop policy if exists profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated
  on public.profiles
  for select
  to authenticated
  using (true);

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
  on public.profiles
  for insert
  to authenticated
  with check (id = (select auth.uid()));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists profiles_service_role_all on public.profiles;
create policy profiles_service_role_all
  on public.profiles
  for all
  to service_role
  using (true)
  with check (true);

comment on policy profiles_select_authenticated on public.profiles is
  'Authenticated users may read profile rows for display names; never select payout/compliance columns in client queries.';

-- ---------------------------------------------------------------------------
-- 4) Payment ledger + payout retry: deny client roles (service_role API only)
-- ---------------------------------------------------------------------------

revoke all on table public.payment_transactions from public;
revoke all on table public.payment_transactions from anon;
revoke all on table public.payment_transactions from authenticated;
grant all on table public.payment_transactions to service_role;

drop policy if exists payment_transactions_deny_authenticated on public.payment_transactions;
create policy payment_transactions_deny_authenticated
  on public.payment_transactions
  for all
  to authenticated
  using (false)
  with check (false);

drop policy if exists payment_transactions_deny_anon on public.payment_transactions;
create policy payment_transactions_deny_anon
  on public.payment_transactions
  for all
  to anon
  using (false)
  with check (false);

drop policy if exists payment_transactions_service_role_all on public.payment_transactions;
create policy payment_transactions_service_role_all
  on public.payment_transactions
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.payment_webhook_events from public;
revoke all on table public.payment_webhook_events from anon;
revoke all on table public.payment_webhook_events from authenticated;
grant all on table public.payment_webhook_events to service_role;

drop policy if exists payment_webhook_events_deny_authenticated on public.payment_webhook_events;
create policy payment_webhook_events_deny_authenticated
  on public.payment_webhook_events
  for all
  to authenticated
  using (false)
  with check (false);

drop policy if exists payment_webhook_events_deny_anon on public.payment_webhook_events;
create policy payment_webhook_events_deny_anon
  on public.payment_webhook_events
  for all
  to anon
  using (false)
  with check (false);

drop policy if exists payment_webhook_events_service_role_all on public.payment_webhook_events;
create policy payment_webhook_events_service_role_all
  on public.payment_webhook_events
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table public.payout_retry_queue from public;
revoke all on table public.payout_retry_queue from anon;
revoke all on table public.payout_retry_queue from authenticated;
grant all on table public.payout_retry_queue to service_role;

drop policy if exists payout_retry_queue_deny_authenticated on public.payout_retry_queue;
create policy payout_retry_queue_deny_authenticated
  on public.payout_retry_queue
  for all
  to authenticated
  using (false)
  with check (false);

drop policy if exists payout_retry_queue_deny_anon on public.payout_retry_queue;
create policy payout_retry_queue_deny_anon
  on public.payout_retry_queue
  for all
  to anon
  using (false)
  with check (false);

drop policy if exists payout_retry_queue_service_role_all on public.payout_retry_queue;
create policy payout_retry_queue_service_role_all
  on public.payout_retry_queue
  for all
  to service_role
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- 5) games / game_move_logs: revoke broad PUBLIC grants (RLS policies unchanged)
-- ---------------------------------------------------------------------------

revoke all on table public.games from public;
revoke all on table public.game_move_logs from public;

grant select, insert, update on table public.games to authenticated;
grant select, insert on table public.game_move_logs to authenticated;
grant all on table public.games to service_role;
grant all on table public.game_move_logs to service_role;
