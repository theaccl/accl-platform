-- Speed up inbox / banner counts and scoped realtime filters on `to_user_id` / `from_user_id` + `status`.

create index if not exists match_requests_to_user_pending_idx
  on public.match_requests (to_user_id, created_at desc)
  where status = 'pending';

create index if not exists match_requests_from_user_pending_idx
  on public.match_requests (from_user_id, created_at desc)
  where status = 'pending';

comment on index public.match_requests_to_user_pending_idx is
  'Inbox + PendingMatchRequestsBanner: pending rows addressed to a user.';

comment on index public.match_requests_from_user_pending_idx is
  'Outgoing pending rows from a user (requests page + realtime).';
