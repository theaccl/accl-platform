-- Phase 29 — read-path indexes for load (no behavior change).
-- payment_transactions: user_id / tournament_id already indexed in 20260411150000_payment_transactions.sql
-- games: ecosystem_scope + status + updated_at indexed in 20260429120000_nexus_ecosystem_scope_and_notices.sql

create index if not exists tournament_entries_user_id_idx
  on public.tournament_entries (user_id);

comment on index public.tournament_entries_user_id_idx is
  'Phase 29 — lookups by user (entries, eligibility); does not change tournament rules.';
