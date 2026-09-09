begin;
alter table public.billing_subscriptions drop constraint billing_subscriptions_plan_check;
alter table public.billing_subscriptions add constraint billing_subscriptions_plan_check check(plan in ('standard','plus','pro'));
create or replace function public.sync_membership_subscription_entitlement(
  p_plan text,
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
  v_plan text;
begin
  if p_plan is null or p_plan not in ('standard','plus','pro') then raise exception 'invalid membership plan'; end if;
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

  if exists(select 1 from public.billing_subscriptions where provider_subscription_id=trim(p_provider_subscription_id) and user_id<>p_user_id) then raise exception 'subscription owner cannot change'; end if;

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
    p_user_id, p_plan, p_status, coalesce(p_cancel_at_period_end, false),
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
    plan = excluded.plan,
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

  select s.plan, case when bool_or(s.current_period_end is null) then null else max(s.current_period_end) end
  into v_plan,v_valid_until from public.billing_subscriptions s
  where s.user_id=p_user_id and s.status in ('active','trialing','past_due')
    and (s.current_period_end is null or s.current_period_end>now())
  group by s.plan order by case s.plan when 'pro' then 3 when 'plus' then 2 else 1 end desc limit 1;
  v_has_access:=v_plan is not null;

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
      'last_subscription_id', trim(p_provider_subscription_id),
      'plan', coalesce(v_plan,p_plan)
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
revoke all on function public.sync_membership_subscription_entitlement(text,text,text,timestamptz,uuid,text,text,text,boolean,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.sync_membership_subscription_entitlement(text,text,text,timestamptz,uuid,text,text,text,boolean,timestamptz,timestamptz) to service_role;

-- Membership is independent of tokens and internal Generator allowances.
-- A Generator-only internal grant does not confer Battlefield membership.
create function public.has_battlefield_membership(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.membership_entitlements e where e.user_id=p_user_id and e.status='active'
  and (e.valid_until is null or e.valid_until>now()) and (
   e.entitlement in ('membership_standard','membership_plus','membership_pro','generation_standard','generation_plus','generation_pro')
   or e.metadata->>'plan' in ('standard','plus','pro')
   or (e.entitlement='image_generator' and not(e.metadata ? 'plan'))
  ));
$$;
revoke all on function public.has_battlefield_membership(uuid) from public,anon,authenticated;
grant execute on function public.has_battlefield_membership(uuid) to service_role;

-- The tournament entry boundary also protects direct SQL/RPC insertion.
-- Existing entries and game recovery updates are preserved.
create function public.enforce_battlefield_membership_entry() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' and new.user_id=old.user_id and new.tournament_id=old.tournament_id then return new; end if;
 if TG_OP='INSERT' and exists(select 1 from public.tournament_entries where user_id=new.user_id and tournament_id=new.tournament_id) then return new; end if;
 if not public.has_battlefield_membership(new.user_id) then
  raise exception using errcode='42501',message='battlefield_membership_required'; end if;
 return new;
end; $$;
revoke all on function public.enforce_battlefield_membership_entry() from public,anon,authenticated;
create trigger battlefield_membership_entry before insert or update of user_id,tournament_id on public.tournament_entries
 for each row execute function public.enforce_battlefield_membership_entry();
commit;
