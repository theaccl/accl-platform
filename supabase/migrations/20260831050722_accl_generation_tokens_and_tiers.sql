-- ACCL Generation Tokens: server-authoritative wallet and immutable ledger.
-- This migration establishes the currency boundary without changing the
-- existing Slice 1 generation request contract. Spending cutover happens only
-- after weekly/rating issuance is scheduled and validated in staging.

begin;

create table public.generation_token_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  lifetime_earned integer not null default 0 check (lifetime_earned >= 0),
  lifetime_spent integer not null default 0 check (lifetime_spent >= 0),
  updated_at timestamptz not null default now()
);

comment on table public.generation_token_accounts is
  'Server-authoritative ACCL Generation Token balances. Browser clients have read-only access to their own account.';

create table public.generation_token_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount <> 0),
  balance_after integer not null check (balance_after >= 0),
  event_type text not null check (event_type in (
    'rating_bracket_award',
    'weekly_allowance',
    'membership_anniversary',
    'commission_spend',
    'commission_refund',
    'support_adjustment'
  )),
  source_key text not null,
  membership_tier text not null default 'free'
    check (membership_tier in ('free', 'plus', 'pro')),
  generation_request_id uuid references public.image_generation_requests(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_key),
  constraint generation_token_ledger_source_key_length_check
    check (char_length(source_key) between 8 and 200)
);

comment on table public.generation_token_ledger is
  'Immutable audit ledger for every Generation Token award, spend, and refund. Source keys make grants and charges idempotent.';

create index generation_token_ledger_user_created_idx
  on public.generation_token_ledger (user_id, created_at desc, id desc);

alter table public.generation_token_accounts enable row level security;
alter table public.generation_token_ledger enable row level security;

create policy generation_token_accounts_select_own
  on public.generation_token_accounts for select to authenticated
  using (user_id = (select auth.uid()));

create policy generation_token_ledger_select_own
  on public.generation_token_ledger for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.generation_token_accounts from anon, authenticated;
revoke all on public.generation_token_ledger from anon, authenticated;
grant select on public.generation_token_accounts to authenticated;
grant select on public.generation_token_ledger to authenticated;
grant all on public.generation_token_accounts to service_role;
grant all on public.generation_token_ledger to service_role;
grant usage, select on sequence public.generation_token_ledger_id_seq to service_role;

create function public.adjust_generation_token_balance(
  p_user_id uuid,
  p_amount integer,
  p_event_type text,
  p_source_key text,
  p_membership_tier text default 'free',
  p_generation_request_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.generation_token_accounts%rowtype;
  v_existing public.generation_token_ledger%rowtype;
begin
  if p_user_id is null then raise exception 'user required'; end if;
  if p_amount is null or p_amount = 0 then raise exception 'non-zero amount required'; end if;
  if p_event_type not in (
    'rating_bracket_award', 'weekly_allowance', 'membership_anniversary',
    'commission_spend', 'commission_refund', 'support_adjustment'
  ) then raise exception 'invalid token event type'; end if;
  if p_membership_tier not in ('free', 'plus', 'pro') then
    raise exception 'invalid membership tier';
  end if;
  if char_length(trim(coalesce(p_source_key, ''))) not between 8 and 200 then
    raise exception 'source key must be 8-200 characters';
  end if;

  select * into v_existing
  from public.generation_token_ledger
  where source_key = trim(p_source_key);

  if found then
    if v_existing.user_id <> p_user_id
      or v_existing.amount <> p_amount
      or v_existing.event_type <> p_event_type then
      raise exception 'token source key reused with different adjustment';
    end if;
    return jsonb_build_object(
      'balance', v_existing.balance_after,
      'ledger_id', v_existing.id,
      'idempotent_replay', true
    );
  end if;

  insert into public.generation_token_accounts (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select * into v_account
  from public.generation_token_accounts
  where user_id = p_user_id
  for update;

  if v_account.balance + p_amount < 0 then
    raise exception using message = 'insufficient generation tokens', errcode = 'P0001';
  end if;

  update public.generation_token_accounts
  set balance = balance + p_amount,
      lifetime_earned = lifetime_earned + greatest(p_amount, 0),
      lifetime_spent = lifetime_spent + greatest(-p_amount, 0),
      updated_at = now()
  where user_id = p_user_id
  returning * into v_account;

  insert into public.generation_token_ledger (
    user_id, amount, balance_after, event_type, source_key,
    membership_tier, generation_request_id, metadata
  ) values (
    p_user_id, p_amount, v_account.balance, p_event_type, trim(p_source_key),
    p_membership_tier, p_generation_request_id, coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_existing.id;

  return jsonb_build_object(
    'balance', v_account.balance,
    'ledger_id', v_existing.id,
    'idempotent_replay', false
  );
end;
$$;

revoke all on function public.adjust_generation_token_balance(
  uuid, integer, text, text, text, uuid, jsonb
) from public;
grant execute on function public.adjust_generation_token_balance(
  uuid, integer, text, text, text, uuid, jsonb
) to service_role;

commit;
