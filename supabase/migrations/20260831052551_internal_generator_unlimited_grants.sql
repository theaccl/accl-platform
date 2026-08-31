-- Hidden ACCL Internal Unlimited plan.
-- Grants are bound to an exact, currently verified email and may only be
-- created/revoked by the service role. Browser clients cannot enumerate them.

begin;

create table public.internal_generator_unlimited_grants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email_normalized text not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint internal_generator_unlimited_email_check check (
    email_normalized = lower(trim(email_normalized))
    and char_length(email_normalized) between 3 and 320
  )
);

comment on table public.internal_generator_unlimited_grants is
  'Private exact-email allowlist for ACCL-controlled Internal Unlimited accounts. Current verified auth email must continue to match.';

create unique index internal_generator_unlimited_email_idx
  on public.internal_generator_unlimited_grants (email_normalized);

alter table public.internal_generator_unlimited_grants enable row level security;
revoke all on public.internal_generator_unlimited_grants from anon, authenticated;
grant all on public.internal_generator_unlimited_grants to service_role;

create function public.set_internal_generator_unlimited_by_email(
  p_email text,
  p_active boolean,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_user auth.users%rowtype;
  v_grant public.internal_generator_unlimited_grants%rowtype;
begin
  if char_length(v_email) not between 3 and 320 then
    raise exception 'valid email required';
  end if;

  select * into v_user
  from auth.users
  where lower(email) = v_email
    and email_confirmed_at is not null
  order by created_at desc
  limit 1;

  if not found then
    raise exception 'verified ACCL account not found for email';
  end if;

  insert into public.internal_generator_unlimited_grants (
    user_id, email_normalized, status, reason, revoked_at
  ) values (
    v_user.id,
    v_email,
    case when p_active then 'active' else 'revoked' end,
    nullif(trim(coalesce(p_reason, '')), ''),
    case when p_active then null else now() end
  )
  on conflict (user_id) do update set
    email_normalized = excluded.email_normalized,
    status = excluded.status,
    reason = excluded.reason,
    revoked_at = excluded.revoked_at,
    updated_at = now()
  returning * into v_grant;

  return jsonb_build_object(
    'user_id', v_grant.user_id,
    'email', v_grant.email_normalized,
    'status', v_grant.status,
    'updated_at', v_grant.updated_at
  );
end;
$$;

revoke all on function public.set_internal_generator_unlimited_by_email(text, boolean, text) from public;
grant execute on function public.set_internal_generator_unlimited_by_email(text, boolean, text) to service_role;

-- Unlimited commissions are auditable token-use events with a zero balance
-- movement. Public plans continue to require non-zero ledger adjustments.
alter table public.generation_token_ledger
  drop constraint generation_token_ledger_amount_check,
  drop constraint generation_token_ledger_event_type_check;

alter table public.generation_token_ledger
  add constraint generation_token_ledger_amount_check check (
    amount <> 0 or event_type = 'internal_unlimited_commission'
  ),
  add constraint generation_token_ledger_event_type_check check (event_type in (
    'rating_bracket_award',
    'weekly_allowance',
    'membership_anniversary',
    'commission_spend',
    'commission_refund',
    'support_adjustment',
    'internal_unlimited_commission'
  ));

create or replace function public.create_image_generation_request(
  p_owner_id uuid,
  p_prompt text,
  p_candidate_count smallint,
  p_idempotency_key text,
  p_reference_id uuid default null,
  p_provider text default 'unconfigured',
  p_model text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_request public.image_generation_requests%rowtype;
  v_reference public.image_generation_references%rowtype;
  v_internal_unlimited boolean := false;
  v_balance integer := 0;
begin
  if p_owner_id is null then raise exception 'owner required'; end if;
  if p_candidate_count is null or p_candidate_count not between 1 and 4 then
    raise exception 'candidate_count must be between 1 and 4';
  end if;

  select exists (
    select 1
    from public.internal_generator_unlimited_grants g
    join auth.users u on u.id = g.user_id
    where g.user_id = p_owner_id
      and g.status = 'active'
      and u.email_confirmed_at is not null
      and lower(u.email) = g.email_normalized
  ) into v_internal_unlimited;

  if not v_internal_unlimited and not exists (
    select 1 from public.membership_entitlements e
    where e.user_id = p_owner_id
      and e.entitlement = 'image_generator'
      and e.status = 'active'
      and (e.valid_until is null or e.valid_until > now())
  ) then
    raise exception using message = 'image_generator entitlement required', errcode = '42501';
  end if;

  if p_reference_id is not null then
    select * into v_reference
    from public.image_generation_references r
    where r.id = p_reference_id and r.owner_id = p_owner_id
    for update;
    if not found or v_reference.status <> 'ready' or v_reference.expires_at <= now() then
      raise exception 'reference image is unavailable';
    end if;
  end if;

  insert into public.image_generation_requests (
    owner_id, prompt, candidate_count, idempotency_key, provider, model, reference_id
  ) values (
    p_owner_id, trim(p_prompt), p_candidate_count, trim(p_idempotency_key),
    coalesce(nullif(trim(p_provider), ''), 'unconfigured'), nullif(trim(p_model), ''), p_reference_id
  )
  on conflict (owner_id, idempotency_key) do update
    set idempotency_key = excluded.idempotency_key
  returning * into v_request;

  if v_request.prompt <> trim(p_prompt)
    or v_request.candidate_count <> p_candidate_count
    or v_request.reference_id is distinct from p_reference_id then
    raise exception 'idempotency key reused with different request';
  end if;

  if v_internal_unlimited then
    select coalesce(a.balance, 0) into v_balance
    from (select 1) seed
    left join public.generation_token_accounts a on a.user_id = p_owner_id;

    insert into public.generation_token_ledger (
      user_id, amount, balance_after, event_type, source_key,
      membership_tier, generation_request_id, metadata
    ) values (
      p_owner_id,
      0,
      v_balance,
      'internal_unlimited_commission',
      'internal-unlimited:' || v_request.id::text,
      'pro',
      v_request.id,
      jsonb_build_object('plan', 'internal_unlimited', 'tokens_display', 'infinity')
    ) on conflict (source_key) do nothing;
  end if;

  return (to_jsonb(v_request) - 'failure_detail') || jsonb_build_object(
    'internal_unlimited', v_internal_unlimited
  );
end;
$$;

revoke all on function public.create_image_generation_request(uuid, text, smallint, text, uuid, text, text) from public;
grant execute on function public.create_image_generation_request(uuid, text, smallint, text, uuid, text, text) to service_role;

commit;
