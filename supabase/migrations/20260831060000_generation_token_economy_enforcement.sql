-- ACCL Generation Token economy cutover.
-- Reserves one token at commission creation, spends it when trusted processing
-- begins, and refunds it when no reviewable result is produced.

begin;

alter table public.membership_entitlements
  drop constraint membership_entitlements_name_check,
  add constraint membership_entitlements_name_check check (
    entitlement in (
      'image_generator',
      'profile_motion',
      'membership_plus',
      'membership_pro',
      'generation_plus',
      'generation_pro'
    )
  );

alter table public.generation_token_accounts
  add column reserved integer not null default 0 check (reserved >= 0);

alter table public.image_generation_requests
  drop constraint image_generation_requests_candidate_count_check,
  add constraint image_generation_requests_candidate_count_check
    check (candidate_count between 1 and 5),
  add column membership_tier text not null default 'pro'
    check (membership_tier in ('free', 'plus', 'pro', 'internal_unlimited')),
  add column token_state text not null default 'legacy_unmetered'
    check (token_state in ('legacy_unmetered', 'reserved', 'spent', 'refunded'));

alter table public.image_generation_candidates
  drop constraint image_generation_candidates_ordinal_check,
  add constraint image_generation_candidates_ordinal_check
    check (ordinal between 1 and 13);

alter table public.generation_token_ledger
  drop constraint generation_token_ledger_amount_check,
  drop constraint generation_token_ledger_event_type_check,
  drop constraint generation_token_ledger_membership_tier_check;

alter table public.generation_token_ledger
  add constraint generation_token_ledger_amount_check check (
    amount <> 0 or event_type in (
      'commission_reservation',
      'commission_spend',
      'commission_refund',
      'internal_unlimited_commission'
    )
  ),
  add constraint generation_token_ledger_event_type_check check (event_type in (
    'rating_milestone_mint',
    'plus_weekly_mint',
    'pro_weekly_mint',
    'pro_anniversary_mint',
    'commission_reservation',
    'commission_spend',
    'commission_refund',
    'administrative_adjustment',
    'internal_unlimited_commission',
    -- Legacy names remain readable for migrations already applied in staging.
    'rating_bracket_award',
    'weekly_allowance',
    'membership_anniversary',
    'support_adjustment'
  )),
  add constraint generation_token_ledger_membership_tier_check
    check (membership_tier in ('free', 'plus', 'pro', 'internal_unlimited'));

create table public.generation_token_redemptions (
  generation_request_id uuid primary key
    references public.image_generation_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  membership_tier text not null
    check (membership_tier in ('free', 'plus', 'pro', 'internal_unlimited')),
  token_cost integer not null check (token_cost in (0, 1)),
  state text not null default 'reserved'
    check (state in ('reserved', 'spent', 'refunded')),
  reserved_at timestamptz not null default now(),
  spent_at timestamptz,
  refunded_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint generation_token_redemptions_zero_cost_check check (
    token_cost = 1 or membership_tier = 'internal_unlimited'
  )
);

create index generation_token_redemptions_user_idx
  on public.generation_token_redemptions (user_id, reserved_at desc);

create table public.generation_token_weekly_mints (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  granted_amount integer not null default 0 check (granted_amount between 0 and 4),
  highest_tier text not null check (highest_tier in ('plus', 'pro')),
  updated_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

alter table public.generation_token_redemptions enable row level security;
alter table public.generation_token_weekly_mints enable row level security;

create policy generation_token_redemptions_select_own
  on public.generation_token_redemptions for select to authenticated
  using (user_id = (select auth.uid()));

create policy generation_token_weekly_mints_select_own
  on public.generation_token_weekly_mints for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.generation_token_redemptions from anon, authenticated;
revoke all on public.generation_token_weekly_mints from anon, authenticated;
grant select on public.generation_token_redemptions to authenticated;
grant select on public.generation_token_weekly_mints to authenticated;
grant all on public.generation_token_redemptions to service_role;
grant all on public.generation_token_weekly_mints to service_role;

create or replace function public.effective_image_generator_tier(p_user_id uuid)
returns text
language plpgsql
security definer
stable
set search_path = public, auth
as $$
declare
  v_tier text := 'free';
begin
  if p_user_id is null then raise exception 'user required'; end if;

  if exists (
    select 1
    from auth.users u
    join public.internal_generator_unlimited_grants g
      on g.email_normalized = lower(u.email)
    where u.id = p_user_id
      and u.email_confirmed_at is not null
      and g.status = 'active'
      and (g.user_id is null or g.user_id = u.id)
  ) then
    return 'internal_unlimited';
  end if;

  if exists (
    select 1 from public.membership_entitlements e
    where e.user_id = p_user_id
      and e.status = 'active'
      and (e.valid_until is null or e.valid_until > now())
      and (
        e.entitlement in ('membership_pro', 'generation_pro')
        or lower(coalesce(e.metadata ->> 'plan', '')) = 'pro'
        or (
          e.entitlement = 'image_generator'
          and lower(coalesce(e.metadata ->> 'plan', 'pro')) <> 'plus'
        )
      )
  ) then
    return 'pro';
  end if;

  if exists (
    select 1 from public.membership_entitlements e
    where e.user_id = p_user_id
      and e.status = 'active'
      and (e.valid_until is null or e.valid_until > now())
      and (
        e.entitlement in ('membership_plus', 'generation_plus')
        or lower(coalesce(e.metadata ->> 'plan', '')) = 'plus'
      )
  ) then
    v_tier := 'plus';
  end if;

  return v_tier;
end;
$$;

revoke all on function public.effective_image_generator_tier(uuid) from public, anon, authenticated;
grant execute on function public.effective_image_generator_tier(uuid) to service_role;

create or replace function public.adjust_generation_token_balance(
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
  v_counts_as_earned boolean;
begin
  if p_user_id is null then raise exception 'user required'; end if;
  if p_amount is null or p_amount = 0 then raise exception 'non-zero amount required'; end if;
  if p_event_type not in (
    'rating_milestone_mint', 'plus_weekly_mint', 'pro_weekly_mint',
    'pro_anniversary_mint', 'administrative_adjustment',
    'rating_bracket_award', 'weekly_allowance',
    'membership_anniversary', 'support_adjustment'
  ) then raise exception 'invalid token adjustment event type'; end if;
  if p_membership_tier not in ('free', 'plus', 'pro', 'internal_unlimited') then
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

  v_counts_as_earned := p_amount > 0 and p_event_type not in ('commission_refund');

  update public.generation_token_accounts
  set balance = balance + p_amount,
      lifetime_earned = lifetime_earned + case when v_counts_as_earned then p_amount else 0 end,
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
) from public, anon, authenticated;
grant execute on function public.adjust_generation_token_balance(
  uuid, integer, text, text, text, uuid, jsonb
) to service_role;

create or replace function public.transition_generation_token_redemption(
  p_request_id uuid,
  p_action text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_redemption public.generation_token_redemptions%rowtype;
  v_account public.generation_token_accounts%rowtype;
  v_event_type text;
  v_amount integer;
begin
  if p_action not in ('spend', 'refund') then raise exception 'invalid redemption action'; end if;

  select * into v_redemption
  from public.generation_token_redemptions
  where generation_request_id = p_request_id
  for update;

  if not found then return false; end if;
  if p_action = 'spend' and v_redemption.state <> 'reserved' then return true; end if;
  if p_action = 'refund' and v_redemption.state = 'refunded' then return true; end if;

  insert into public.generation_token_accounts (user_id)
  values (v_redemption.user_id)
  on conflict (user_id) do nothing;

  select * into v_account
  from public.generation_token_accounts
  where user_id = v_redemption.user_id
  for update;

  if p_action = 'spend' then
    if v_account.reserved < v_redemption.token_cost then
      raise exception 'reserved generation token invariant violated';
    end if;
    update public.generation_token_accounts
    set reserved = reserved - v_redemption.token_cost,
        lifetime_spent = lifetime_spent + v_redemption.token_cost,
        updated_at = now()
    where user_id = v_redemption.user_id
    returning * into v_account;
    v_event_type := 'commission_spend';
    v_amount := 0;
  else
    update public.generation_token_accounts
    set balance = balance + v_redemption.token_cost,
        reserved = reserved - case when v_redemption.state = 'reserved' then v_redemption.token_cost else 0 end,
        updated_at = now()
    where user_id = v_redemption.user_id
    returning * into v_account;
    v_event_type := 'commission_refund';
    v_amount := v_redemption.token_cost;
  end if;

  insert into public.generation_token_ledger (
    user_id, amount, balance_after, event_type, source_key,
    membership_tier, generation_request_id, metadata
  ) values (
    v_redemption.user_id,
    v_amount,
    v_account.balance,
    v_event_type,
    'commission-' || p_action || ':' || p_request_id::text,
    v_redemption.membership_tier,
    p_request_id,
    jsonb_build_object('token_cost', v_redemption.token_cost)
  ) on conflict (source_key) do nothing;

  update public.generation_token_redemptions
  set state = case when p_action = 'spend' then 'spent' else 'refunded' end,
      spent_at = case when p_action = 'spend' then now() else spent_at end,
      refunded_at = case when p_action = 'refund' then now() else refunded_at end,
      updated_at = now()
  where generation_request_id = p_request_id;

  update public.image_generation_requests
  set token_state = case when p_action = 'spend' then 'spent' else 'refunded' end,
      updated_at = now()
  where id = p_request_id;

  return true;
end;
$$;

revoke all on function public.transition_generation_token_redemption(uuid, text)
  from public, anon, authenticated;
grant execute on function public.transition_generation_token_redemption(uuid, text)
  to service_role;

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
  v_account public.generation_token_accounts%rowtype;
  v_tier text;
  v_expected_candidates smallint;
  v_token_cost integer;
begin
  if p_owner_id is null then raise exception 'owner required'; end if;
  v_tier := public.effective_image_generator_tier(p_owner_id);
  v_expected_candidates := case v_tier
    when 'free' then 3
    when 'plus' then 4
    else 5
  end;
  v_token_cost := case when v_tier = 'internal_unlimited' then 0 else 1 end;

  if p_candidate_count is distinct from v_expected_candidates then
    raise exception 'candidate_count does not match effective membership tier';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 714));

  select * into v_request
  from public.image_generation_requests r
  where r.owner_id = p_owner_id and r.idempotency_key = trim(p_idempotency_key)
  for update;

  if found then
    if v_request.prompt <> trim(p_prompt)
      or v_request.candidate_count <> p_candidate_count
      or v_request.reference_id is distinct from p_reference_id then
      raise exception 'idempotency key reused with different request';
    end if;
    return to_jsonb(v_request) - 'failure_detail';
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
    owner_id, prompt, candidate_count, idempotency_key, provider, model,
    reference_id, membership_tier, token_state
  ) values (
    p_owner_id, trim(p_prompt), p_candidate_count, trim(p_idempotency_key),
    coalesce(nullif(trim(p_provider), ''), 'unconfigured'), nullif(trim(p_model), ''),
    p_reference_id, v_tier, 'reserved'
  ) returning * into v_request;

  insert into public.generation_token_accounts (user_id)
  values (p_owner_id)
  on conflict (user_id) do nothing;

  select * into v_account
  from public.generation_token_accounts
  where user_id = p_owner_id
  for update;

  if v_account.balance < v_token_cost then
    raise exception using message = 'insufficient generation tokens', errcode = 'P0001';
  end if;

  update public.generation_token_accounts
  set balance = balance - v_token_cost,
      reserved = reserved + v_token_cost,
      updated_at = now()
  where user_id = p_owner_id
  returning * into v_account;

  insert into public.generation_token_redemptions (
    generation_request_id, user_id, membership_tier, token_cost
  ) values (v_request.id, p_owner_id, v_tier, v_token_cost);

  insert into public.generation_token_ledger (
    user_id, amount, balance_after, event_type, source_key,
    membership_tier, generation_request_id, metadata
  ) values (
    p_owner_id,
    -v_token_cost,
    v_account.balance,
    'commission_reservation',
    'commission-reservation:' || v_request.id::text,
    v_tier,
    v_request.id,
    jsonb_build_object('token_cost', v_token_cost)
  );

  if v_tier = 'internal_unlimited' then
    update public.internal_generator_unlimited_grants g
    set user_id = p_owner_id, updated_at = now()
    from auth.users u
    where u.id = p_owner_id
      and g.email_normalized = lower(u.email)
      and g.user_id is null;
  end if;

  return to_jsonb(v_request) - 'failure_detail';
end;
$$;

revoke all on function public.create_image_generation_request(
  uuid, text, smallint, text, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.create_image_generation_request(
  uuid, text, smallint, text, uuid, text, text
) to service_role;

create or replace function public.claim_next_image_generation_request()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select r.id into v_id
  from public.image_generation_requests r
  where r.status = 'queued'
    and r.next_attempt_at <= now()
    and r.attempt_count < 3
  order by r.next_attempt_at, r.created_at, r.id
  for update skip locked
  limit 1;

  if v_id is null then return null; end if;

  update public.image_generation_requests
  set status = 'running', claimed_at = now(),
      attempt_count = attempt_count + 1, updated_at = now()
  where id = v_id;

  perform public.transition_generation_token_redemption(v_id, 'spend');

  return (
    select to_jsonb(r) - 'failure_detail'
    from public.image_generation_requests r where r.id = v_id
  );
end;
$$;

create or replace function public.retry_or_fail_image_generation_request(
  p_request_id uuid,
  p_retryable boolean,
  p_failure_code text default null,
  p_failure_detail text default null,
  p_retry_after_seconds integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.image_generation_requests%rowtype;
  v_retry boolean;
begin
  select * into v_request
  from public.image_generation_requests
  where id = p_request_id
  for update;

  if not found or v_request.status <> 'running' then return null; end if;
  v_retry := p_retryable and v_request.attempt_count < 3;

  delete from public.image_generation_candidates
  where request_id = p_request_id and status = 'review';

  update public.image_generation_requests
  set status = case when v_retry then 'queued' else 'failed' end,
      claimed_at = case when v_retry then null else claimed_at end,
      next_attempt_at = case
        when v_retry then now() + make_interval(secs => least(300, greatest(1, p_retry_after_seconds)))
        else next_attempt_at
      end,
      completed_at = case when v_retry then null else now() end,
      failure_code = nullif(trim(p_failure_code), ''),
      failure_detail = left(p_failure_detail, 2000),
      updated_at = now()
  where id = p_request_id;

  if not v_retry then
    perform public.transition_generation_token_redemption(p_request_id, 'refund');
  end if;

  return jsonb_build_object(
    'request_id', p_request_id,
    'status', case when v_retry then 'queued' else 'failed' end,
    'attempt_count', v_request.attempt_count
  );
end;
$$;

create or replace function public.cancel_image_generation_request(
  p_owner_id uuid,
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.image_generation_requests%rowtype;
begin
  select * into v_request
  from public.image_generation_requests
  where id = p_request_id and owner_id = p_owner_id
  for update;

  if not found or v_request.status not in ('queued', 'review') then return false; end if;

  update public.image_generation_requests
  set status = 'cancelled', completed_at = now(), updated_at = now()
  where id = p_request_id;

  update public.image_generation_candidates
  set status = 'deleted', updated_at = now()
  where request_id = p_request_id and status = 'review';

  if v_request.status = 'queued' then
    perform public.transition_generation_token_redemption(p_request_id, 'refund');
  end if;
  return true;
end;
$$;

revoke all on function public.cancel_image_generation_request(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_image_generation_request(uuid, uuid)
  to service_role;

create or replace function public.mint_weekly_generation_tokens(
  p_user_id uuid,
  p_week_start date default (date_trunc('week', now() at time zone 'utc'))::date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_target integer;
  v_existing integer := 0;
  v_delta integer;
  v_result jsonb;
begin
  v_tier := public.effective_image_generator_tier(p_user_id);
  v_target := case v_tier when 'plus' then 2 when 'pro' then 4 else 0 end;
  if v_target = 0 then
    return jsonb_build_object('user_id', p_user_id, 'tier', v_tier, 'minted', 0);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_week_start::text, 715));

  select granted_amount into v_existing
  from public.generation_token_weekly_mints
  where user_id = p_user_id and week_start = p_week_start
  for update;
  v_existing := coalesce(v_existing, 0);
  v_delta := greatest(v_target - v_existing, 0);

  if v_delta > 0 then
    v_result := public.adjust_generation_token_balance(
      p_user_id,
      v_delta,
      case when v_tier = 'pro' then 'pro_weekly_mint' else 'plus_weekly_mint' end,
      'weekly-mint:' || p_user_id::text || ':' || p_week_start::text || ':' || v_target::text,
      v_tier,
      null,
      jsonb_build_object('week_start', p_week_start, 'weekly_target', v_target)
    );
  end if;

  insert into public.generation_token_weekly_mints (
    user_id, week_start, granted_amount, highest_tier
  ) values (p_user_id, p_week_start, v_target, v_tier)
  on conflict (user_id, week_start) do update set
    granted_amount = greatest(public.generation_token_weekly_mints.granted_amount, excluded.granted_amount),
    highest_tier = case
      when excluded.highest_tier = 'pro' then 'pro'
      else public.generation_token_weekly_mints.highest_tier
    end,
    updated_at = now();

  return jsonb_build_object(
    'user_id', p_user_id,
    'tier', v_tier,
    'minted', v_delta,
    'weekly_target', v_target,
    'balance', v_result -> 'balance'
  );
end;
$$;

create or replace function public.mint_due_generation_token_allowances(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week date := (date_trunc('week', now() at time zone 'utc'))::date;
  v_row record;
  v_results jsonb := '[]'::jsonb;
begin
  for v_row in
    select distinct e.user_id
    from public.membership_entitlements e
    left join public.generation_token_weekly_mints m
      on m.user_id = e.user_id and m.week_start = v_week
    where e.status = 'active'
      and (e.valid_until is null or e.valid_until > now())
      and e.entitlement in (
        'image_generator', 'membership_plus', 'membership_pro',
        'generation_plus', 'generation_pro'
      )
      and coalesce(m.granted_amount, 0) < case
        when public.effective_image_generator_tier(e.user_id) = 'pro' then 4
        when public.effective_image_generator_tier(e.user_id) = 'plus' then 2
        else 0
      end
    order by e.user_id
    limit least(500, greatest(1, p_limit))
  loop
    v_results := v_results || jsonb_build_array(
      public.mint_weekly_generation_tokens(v_row.user_id, v_week)
    );
  end loop;
  return v_results;
end;
$$;

revoke all on function public.mint_weekly_generation_tokens(uuid, date)
  from public, anon, authenticated;
revoke all on function public.mint_due_generation_token_allowances(integer)
  from public, anon, authenticated;
grant execute on function public.mint_weekly_generation_tokens(uuid, date)
  to service_role;
grant execute on function public.mint_due_generation_token_allowances(integer)
  to service_role;

create or replace function public.mint_pro_anniversary_generation_tokens(
  p_user_id uuid,
  p_membership_year integer,
  p_anniversary_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_membership_year < 1 then raise exception 'membership year must be positive'; end if;
  if public.effective_image_generator_tier(p_user_id) not in ('pro', 'internal_unlimited') then
    raise exception 'active Pro membership required';
  end if;
  if public.effective_image_generator_tier(p_user_id) = 'internal_unlimited' then
    return jsonb_build_object('user_id', p_user_id, 'minted', 0, 'unlimited', true);
  end if;
  return public.adjust_generation_token_balance(
    p_user_id,
    5,
    'pro_anniversary_mint',
    'pro-anniversary:' || p_user_id::text || ':' || p_membership_year::text,
    'pro',
    null,
    jsonb_build_object(
      'membership_year', p_membership_year,
      'anniversary_date', p_anniversary_date
    )
  );
end;
$$;

revoke all on function public.mint_pro_anniversary_generation_tokens(uuid, integer, date)
  from public, anon, authenticated;
grant execute on function public.mint_pro_anniversary_generation_tokens(uuid, integer, date)
  to service_role;

create or replace function public.mint_generation_token_on_rating_peak()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_order integer;
  v_old_order integer;
  v_tier text;
begin
  if old.peak_rank_band is null or new.peak_rank_band is null then return new; end if;
  v_new_order := public.badge_band_sort_order(new.peak_rank_band);
  v_old_order := public.badge_band_sort_order(old.peak_rank_band);
  if v_new_order <= v_old_order or v_new_order <= 0 then return new; end if;

  v_tier := public.effective_image_generator_tier(new.user_id);
  perform public.adjust_generation_token_balance(
    new.user_id,
    1,
    'rating_milestone_mint',
    'rating-milestone:' || new.user_id::text || ':' || new.peak_rank_band,
    v_tier,
    null,
    jsonb_build_object(
      'track_key', new.track_key,
      'rank_band', new.peak_rank_band,
      'previous_track_peak', old.peak_rank_band
    )
  );
  return new;
end;
$$;

revoke all on function public.mint_generation_token_on_rating_peak()
  from public, anon, authenticated;

drop trigger if exists player_badge_state_generation_token_peak
  on public.player_badge_state;
create trigger player_badge_state_generation_token_peak
after update of peak_rank_band on public.player_badge_state
for each row execute function public.mint_generation_token_on_rating_peak();

commit;
