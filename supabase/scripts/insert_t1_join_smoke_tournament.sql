-- T1 join-flow smoke test: one pending free adult tournament (no entrants, no matches).
-- Run in Supabase SQL Editor. Returns the new tournament id.
insert into public.tournaments (
  name,
  status,
  format,
  tempo,
  live_time_control,
  rated,
  created_by,
  ecosystem_scope,
  entry_fee_cents,
  prize_pool_cents
)
select
  'T1 Join Smoke Test',
  'pending',
  'single_elimination',
  'live',
  null,
  true,
  (select id from public.profiles limit 1),
  'adult',
  null,
  null
returning id, name, status, ecosystem_scope, format, tempo, rated, entry_fee_cents, prize_pool_cents;
