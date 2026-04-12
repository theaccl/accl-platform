-- Phase 27 — auditable payment ledger (separate from gameplay). Service-role writes from API only.

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  tournament_id uuid null references public.tournaments (id) on delete set null,
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null default 'usd',
  type text not null constraint payment_transactions_type_check check (type in ('entry', 'payout', 'refund')),
  status text not null constraint payment_transactions_status_check check (status in ('pending', 'completed', 'failed', 'refunded')),
  provider text not null default 'stripe',
  provider_payment_id text null,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists payment_transactions_provider_payment_id_unique
  on public.payment_transactions (provider_payment_id)
  where provider_payment_id is not null;

create index if not exists payment_transactions_user_created_idx
  on public.payment_transactions (user_id, created_at desc);

create index if not exists payment_transactions_tournament_idx
  on public.payment_transactions (tournament_id)
  where tournament_id is not null;

create unique index if not exists payment_transactions_one_pending_entry_per_user_tournament
  on public.payment_transactions (user_id, tournament_id)
  where type = 'entry' and status = 'pending' and tournament_id is not null;

comment on table public.payment_transactions is
  'Financial ledger rows — gameplay never branches on these; webhooks grant tournament_entries after confirmed entry payments.';

-- Idempotent webhook processing (provider event ids).
create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_id text not null unique,
  received_at timestamptz not null default now(),
  event_type text null,
  payload jsonb null
);

comment on table public.payment_webhook_events is 'Dedupes payment provider webhooks — insert-before-process pattern.';

alter table public.tournaments
  add column if not exists entry_fee_cents bigint null,
  add column if not exists prize_pool_cents bigint null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tournaments_entry_fee_cents_nonneg'
  ) then
    alter table public.tournaments
      add constraint tournaments_entry_fee_cents_nonneg
      check (entry_fee_cents is null or entry_fee_cents >= 0);
  end if;
exception when duplicate_object then null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'tournaments_prize_pool_cents_nonneg'
  ) then
    alter table public.tournaments
      add constraint tournaments_prize_pool_cents_nonneg
      check (prize_pool_cents is null or prize_pool_cents >= 0);
  end if;
exception when duplicate_object then null;
end $$;

comment on column public.tournaments.entry_fee_cents is 'USD cents; null = free entry (no paid flow).';
comment on column public.tournaments.prize_pool_cents is 'Display / payout planning — not a gameplay field.';

alter table public.payment_transactions enable row level security;
alter table public.payment_webhook_events enable row level security;
