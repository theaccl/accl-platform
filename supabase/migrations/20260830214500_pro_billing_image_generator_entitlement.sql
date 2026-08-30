-- Stripe Pro subscription state is the authoritative source for image_generator access.
-- Webhook synchronization and entitlement mutation are atomic and service-role-only.

begin;

create table public.billing_subscriptions (
  provider text not null default 'stripe' check (provider = 'stripe'),
  provider_subscription_id text primary key,
  provider_customer_id text,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null default 'pro' check (plan = 'pro'),
  status text not null check (
    status in ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')
  ),
  cancel_at_period_end boolean not null default false,
  current_period_end timestamptz,
  last_provider_event_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index billing_subscriptions_user_status_idx
  on public.billing_subscriptions (user_id, status, current_period_end desc);

create table public.billing_subscription_webhook_events (
  provider_event_id text primary key,
  provider_subscription_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  provider_created_at timestamptz not null,
  processed_at timestamptz not null default now()
);

create index billing_subscription_webhook_events_user_idx
  on public.billing_subscription_webhook_events (user_id, provider_created_at desc);

alter table public.billing_subscriptions enable row level security;
alter table public.billing_subscription_webhook_events enable row level security;

create policy billing_subscriptions_select_own
  on public.billing_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.billing_subscriptions from anon, authenticated;
revoke all on public.billing_subscription_webhook_events from anon, authenticated;
grant select on public.billing_subscriptions to authenticated;
grant all on public.billing_subscriptions to service_role;
grant all on public.billing_subscription_webhook_events to service_role;

create or replace function public.sync_pro_subscription_entitlement(
  p_provider_event_id text,
  p_event_type text,
  p_provider_created_at timestamptz,
  p_user_id uuid,
  p_provider_subscription_id text,
  p_provider_customer_id text,
  p_status text,
  p_cancel_at_period_end boolean,
  p_current_period_end timestamptz
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

  -- Serialize entitlement reconciliation for the same player across multiple subscriptions.
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
    status, cancel_at_period_end, current_period_end, last_provider_event_at,
    metadata
  ) values (
    'stripe', trim(p_provider_subscription_id), nullif(trim(p_provider_customer_id), ''),
    p_user_id, 'pro', p_status, coalesce(p_cancel_at_period_end, false),
    p_current_period_end, p_provider_created_at,
    jsonb_build_object('last_event_id', trim(p_provider_event_id), 'last_event_type', trim(p_event_type))
  )
  on conflict (provider_subscription_id) do update set
    provider_customer_id = excluded.provider_customer_id,
    user_id = excluded.user_id,
    status = excluded.status,
    cancel_at_period_end = excluded.cancel_at_period_end,
    current_period_end = excluded.current_period_end,
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
  text, text, timestamptz, uuid, text, text, text, boolean, timestamptz
) from public, anon, authenticated;
grant execute on function public.sync_pro_subscription_entitlement(
  text, text, timestamptz, uuid, text, text, text, boolean, timestamptz
) to service_role;

commit;
