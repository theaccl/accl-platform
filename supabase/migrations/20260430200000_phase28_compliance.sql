-- Phase 28 — compliance fields, disputed ledger state, payout retry queue (service-role writes from API).

-- ---------------------------------------------------------------------------
-- payment_transactions.status: add disputed (financial layer only; not gameplay)
-- ---------------------------------------------------------------------------
alter table public.payment_transactions drop constraint if exists payment_transactions_status_check;

alter table public.payment_transactions
  add constraint payment_transactions_status_check
  check (status in ('pending', 'completed', 'failed', 'refunded', 'disputed'));

comment on constraint payment_transactions_status_check on public.payment_transactions is
  'Includes disputed (chargebacks) — tournament results unchanged; ledger reflects financial state.';

-- ---------------------------------------------------------------------------
-- Adult payout profile & risk signals (ignored for K–12 UX; not used in gameplay)
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists legal_name text null;
alter table public.profiles add column if not exists country text null;

alter table public.profiles add column if not exists payout_eligibility_status text not null default 'incomplete';
alter table public.profiles add column if not exists tax_status text not null default 'pending';

alter table public.profiles add column if not exists failed_entry_payment_count int not null default 0;
alter table public.profiles add column if not exists financial_review_flag text null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_payout_eligibility_status_check') then
    alter table public.profiles
      add constraint profiles_payout_eligibility_status_check
      check (payout_eligibility_status in ('incomplete', 'eligible', 'held', 'restricted'));
  end if;
exception when duplicate_object then null;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_tax_status_check') then
    alter table public.profiles
      add constraint profiles_tax_status_check
      check (tax_status in ('pending', 'verified', 'restricted'));
  end if;
exception when duplicate_object then null;
end $$;

comment on column public.profiles.legal_name is 'Adult payouts — optional until user requests paid distribution; not used for gameplay.';
comment on column public.profiles.country is 'ISO-like country label for payout compliance; adult flows only.';
comment on column public.profiles.payout_eligibility_status is 'incomplete | eligible | held | restricted — operator/compliance can set held/restricted.';
comment on column public.profiles.tax_status is 'pending | verified | restricted — foundation only; no tax filing in-app.';
comment on column public.profiles.failed_entry_payment_count is 'Incremented on payment_intent.payment_failed (fraud signal; no auto-ban).';
comment on column public.profiles.financial_review_flag is 'Optional soft flag for internal review (e.g. watch).';

-- ---------------------------------------------------------------------------
-- Failed payout retry queue (simple operator/cron retry target)
-- ---------------------------------------------------------------------------
create table if not exists public.payout_retry_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payment_transaction_id uuid not null references public.payment_transactions (id) on delete cascade,
  attempts int not null default 0,
  last_error text null,
  next_retry_at timestamptz not null,
  constraint payout_retry_queue_unique_tx unique (payment_transaction_id)
);

create index if not exists payout_retry_queue_next_retry_idx
  on public.payout_retry_queue (next_retry_at asc)
  where attempts < 10;

comment on table public.payout_retry_queue is 'Provider payout failures — bounded retries; does not alter tournament results.';

alter table public.payout_retry_queue enable row level security;
