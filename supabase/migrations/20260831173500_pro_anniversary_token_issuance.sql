-- Wire the locked five-token Pro anniversary allowance to authoritative
-- subscription timing. Issuance remains server-only, idempotent, and
-- replacement-based when more than one Pro subscription row exists.

begin;

alter table public.billing_subscriptions
  add column subscription_started_at timestamptz;

comment on column public.billing_subscriptions.subscription_started_at is
  'Provider-authoritative start of the current Pro membership subscription. Anniversary grants remain pending until this value is known.';

create index billing_subscriptions_active_pro_anniversary_idx
  on public.billing_subscriptions (user_id, subscription_started_at, provider_subscription_id)
  where plan = 'pro'
    and status in ('active', 'trialing', 'past_due')
    and subscription_started_at is not null;

drop function if exists public.sync_pro_subscription_entitlement(
  text, text, timestamptz, uuid, text, text, text, boolean, timestamptz
);

create or replace function public.sync_pro_subscription_entitlement(
  p_provider_event_id text,
  p_event_type text,
  p_provider_created_at timestamptz,
  p_user_id uuid,
  p_provider_subscription_id text,
  p_provider_customer_id text,
  p_status text,
  p_cancel_at_period_end boolean,
  p_current_period_end timestamptz,
  p_subscription_started_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer;
  v_has_access boolean;
  v_valid_until timestamptz;
begin
  if p_provider_event_id is null or length(trim(p_provider_event_id)) < 3 then
    raise exception 'provider event id required';
  end if;
  if p_user_id is null then raise exception 'user id required'; end if;
  if p_provider_subscription_id is null or length(trim(p_provider_subscription_id)) < 3 then
    raise exception 'provider subscription id required';
  end if;
  if p_status not in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused') then
    raise exception 'unsupported subscription status';
  end if;
  if p_subscription_started_at is null then
    raise exception 'provider subscription start required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  insert into public.billing_subscription_webhook_events (
    provider_event_id, provider_subscription_id, user_id, event_type, provider_created_at
  ) values (
    trim(p_provider_event_id), trim(p_provider_subscription_id), p_user_id,
    left(trim(p_event_type), 200), p_provider_created_at
  ) on conflict (provider_event_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return false; end if;

  insert into public.billing_subscriptions (
    provider, provider_subscription_id, provider_customer_id, user_id, plan,
    status, cancel_at_period_end, current_period_end, subscription_started_at,
    last_provider_event_at, metadata
  ) values (
    'stripe', trim(p_provider_subscription_id), nullif(trim(p_provider_customer_id), ''),
    p_user_id, 'pro', p_status, coalesce(p_cancel_at_period_end, false),
    p_current_period_end, p_subscription_started_at, p_provider_created_at,
    jsonb_build_object(
      'last_event_id', trim(p_provider_event_id),
      'last_event_type', trim(p_event_type)
    )
  )
  on conflict (provider_subscription_id) do update set
    provider_customer_id = excluded.provider_customer_id,
    user_id = excluded.user_id,
    status = excluded.status,
    cancel_at_period_end = excluded.cancel_at_period_end,
    current_period_end = excluded.current_period_end,
    subscription_started_at = coalesce(
      public.billing_subscriptions.subscription_started_at,
      excluded.subscription_started_at
    ),
    last_provider_event_at = excluded.last_provider_event_at,
    metadata = public.billing_subscriptions.metadata || excluded.metadata,
    updated_at = now()
  where excluded.last_provider_event_at >= public.billing_subscriptions.last_provider_event_at;

  select
    exists (
      select 1 from public.billing_subscriptions s
      where s.user_id = p_user_id
        and s.plan = 'pro'
        and s.status in ('active', 'trialing', 'past_due')
        and (s.current_period_end is null or s.current_period_end > now())
    ),
    max(s.current_period_end) filter (
      where s.status in ('active', 'trialing', 'past_due')
        and (s.current_period_end is null or s.current_period_end > now())
    )
  into v_has_access, v_valid_until
  from public.billing_subscriptions s
  where s.user_id = p_user_id and s.plan = 'pro';

  insert into public.membership_entitlements (
    user_id, entitlement, status, source, valid_until, metadata
  ) values (
    p_user_id,
    'image_generator',
    case when v_has_access then 'active' else 'revoked' end,
    'stripe_subscription',
    case when v_has_access then v_valid_until else null end,
    jsonb_build_object(
      'last_event_id', trim(p_provider_event_id),
      'last_subscription_id', trim(p_provider_subscription_id)
    )
  )
  on conflict (user_id, entitlement) do update set
    status = excluded.status,
    source = excluded.source,
    valid_until = excluded.valid_until,
    metadata = public.membership_entitlements.metadata || excluded.metadata,
    updated_at = now();

  return true;
end;
$$;

revoke all on function public.sync_pro_subscription_entitlement(
  text, text, timestamptz, uuid, text, text, text, boolean, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.sync_pro_subscription_entitlement(
  text, text, timestamptz, uuid, text, text, text, boolean, timestamptz, timestamptz
) to service_role;

drop function if exists public.mint_pro_anniversary_generation_tokens(uuid, integer, date);

create or replace function public.mint_pro_anniversary_generation_tokens(
  p_user_id uuid,
  p_provider_subscription_id text,
  p_membership_year integer,
  p_anniversary_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.billing_subscriptions%rowtype;
  v_expected_date date;
  v_tier text;
  v_source_key text;
  v_result jsonb;
begin
  if p_user_id is null then raise exception 'user required'; end if;
  if length(trim(coalesce(p_provider_subscription_id, ''))) < 3 then
    raise exception 'provider subscription id required';
  end if;
  if p_membership_year < 1 then raise exception 'membership year must be positive'; end if;
  if p_anniversary_date is null then raise exception 'anniversary date required'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_user_id::text || ':' || trim(p_provider_subscription_id) || ':' || p_membership_year::text,
    719
  ));

  select * into v_subscription
  from public.billing_subscriptions s
  where s.provider_subscription_id = trim(p_provider_subscription_id)
    and s.user_id = p_user_id
    and s.plan = 'pro'
    and s.status in ('active', 'trialing', 'past_due')
    and s.subscription_started_at is not null
    and (s.current_period_end is null or s.current_period_end > now())
  for share;

  if not found then raise exception 'active Pro subscription required'; end if;

  v_expected_date := (
    v_subscription.subscription_started_at::date
    + make_interval(years => p_membership_year)
  )::date;
  if p_anniversary_date <> v_expected_date then
    raise exception 'anniversary date does not match subscription start';
  end if;
  if p_anniversary_date > (now() at time zone 'utc')::date then
    raise exception 'anniversary has not completed';
  end if;

  v_tier := public.effective_image_generator_tier(p_user_id);
  if v_tier = 'internal_unlimited' then
    return jsonb_build_object(
      'user_id', p_user_id,
      'provider_subscription_id', trim(p_provider_subscription_id),
      'membership_year', p_membership_year,
      'minted', 0,
      'unlimited', true
    );
  end if;
  if v_tier <> 'pro' then raise exception 'active Pro membership required'; end if;

  v_source_key := 'pro-anniversary:' || p_user_id::text || ':'
    || md5(trim(p_provider_subscription_id)) || ':' || p_membership_year::text;

  v_result := public.adjust_generation_token_balance(
    p_user_id,
    5,
    'pro_anniversary_mint',
    v_source_key,
    'pro',
    null,
    jsonb_build_object(
      'provider_subscription_id', trim(p_provider_subscription_id),
      'subscription_started_at', v_subscription.subscription_started_at,
      'membership_year', p_membership_year,
      'anniversary_date', p_anniversary_date
    )
  );

  return v_result || jsonb_build_object(
    'user_id', p_user_id,
    'provider_subscription_id', trim(p_provider_subscription_id),
    'membership_year', p_membership_year,
    'minted', case when coalesce((v_result ->> 'idempotent_replay')::boolean, false) then 0 else 5 end
  );
end;
$$;

revoke all on function public.mint_pro_anniversary_generation_tokens(uuid, text, integer, date)
  from public, anon, authenticated;
grant execute on function public.mint_pro_anniversary_generation_tokens(uuid, text, integer, date)
  to service_role;

create or replace function public.mint_due_pro_anniversary_generation_tokens(
  p_limit integer default 100,
  p_as_of date default ((now() at time zone 'utc')::date)
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_results jsonb := '[]'::jsonb;
begin
  if p_as_of is null or p_as_of > (now() at time zone 'utc')::date then
    raise exception 'anniversary scan date must not be in the future';
  end if;

  for v_row in
    with ranked_active_subscriptions as (
      select
        s.*,
        row_number() over (
          partition by s.user_id
          order by s.subscription_started_at, s.provider_subscription_id
        ) as subscription_rank
      from public.billing_subscriptions s
      where s.plan = 'pro'
        and s.status in ('active', 'trialing', 'past_due')
        and s.subscription_started_at is not null
        and (s.current_period_end is null or s.current_period_end > now())
    ), due_anniversaries as (
      select
        s.user_id,
        s.provider_subscription_id,
        anniversary.membership_year,
        (
          s.subscription_started_at::date
          + make_interval(years => anniversary.membership_year)
        )::date as anniversary_date
      from ranked_active_subscriptions s
      cross join lateral generate_series(
        1,
        least(
          100,
          greatest(
            0,
            extract(year from p_as_of)::integer
              - extract(year from s.subscription_started_at)::integer
          )
        )
      ) as anniversary(membership_year)
      where s.subscription_rank = 1
    )
    select d.*
    from due_anniversaries d
    where d.anniversary_date <= p_as_of
      and not exists (
        select 1
        from public.generation_token_ledger l
        where l.source_key = 'pro-anniversary:' || d.user_id::text || ':'
          || md5(d.provider_subscription_id) || ':' || d.membership_year::text
      )
    order by d.anniversary_date, d.user_id, d.membership_year
    limit least(500, greatest(1, p_limit))
  loop
    v_results := v_results || jsonb_build_array(
      public.mint_pro_anniversary_generation_tokens(
        v_row.user_id,
        v_row.provider_subscription_id,
        v_row.membership_year,
        v_row.anniversary_date
      )
    );
  end loop;

  return v_results;
end;
$$;

revoke all on function public.mint_due_pro_anniversary_generation_tokens(integer, date)
  from public, anon, authenticated;
grant execute on function public.mint_due_pro_anniversary_generation_tokens(integer, date)
  to service_role;

commit;
