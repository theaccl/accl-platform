-- Local launch cutover. Preserve legacy balances; never infer their source.
begin;

-- The API retains its 2,000-character user-input ceiling; reserve room for
-- the server's validated style direction without truncating player text.
alter table public.image_generation_requests drop constraint image_generation_prompt_length_check;
alter table public.image_generation_requests add constraint image_generation_prompt_length_check check (char_length(trim(prompt)) between 1 and 2300);

alter table public.membership_entitlements drop constraint membership_entitlements_name_check;
alter table public.membership_entitlements add constraint membership_entitlements_name_check check (
 entitlement in ('image_generator','profile_motion','membership_standard','membership_plus','membership_pro','generation_standard','generation_plus','generation_pro'));
alter table public.image_generation_requests drop constraint image_generation_requests_membership_tier_check;
alter table public.image_generation_requests add constraint image_generation_requests_membership_tier_check check (membership_tier in ('free','standard','plus','pro','internal_unlimited'));
alter table public.generation_token_ledger drop constraint generation_token_ledger_membership_tier_check;
alter table public.generation_token_ledger add constraint generation_token_ledger_membership_tier_check check (membership_tier in ('free','standard','plus','pro','internal_unlimited'));
alter table public.generation_token_redemptions drop constraint generation_token_redemptions_membership_tier_check;
alter table public.generation_token_redemptions add constraint generation_token_redemptions_membership_tier_check check (membership_tier in ('free','standard','plus','pro','internal_unlimited'));
alter table public.generation_token_ledger drop constraint generation_token_ledger_event_type_check;
alter table public.generation_token_ledger add constraint generation_token_ledger_event_type_check check (event_type in (
 'rating_milestone_mint','plus_weekly_mint','pro_weekly_mint','pro_anniversary_mint','commission_reservation','commission_spend','commission_refund','administrative_adjustment','internal_unlimited_commission','rating_bracket_award','weekly_allowance','membership_anniversary','support_adjustment','generator_issue_replacement','wallet_credit'));

create table public.generator_wallet_sources (
 user_id uuid not null references auth.users(id) on delete cascade,
 wallet text not null check (wallet in ('generation','guidance','compare')),
 source text not null check (source in ('recurring','signup','reward','replacement','purchased','legacy')),
 balance integer not null default 0 check (balance >= 0),
 updated_at timestamptz not null default now(),
 primary key(user_id,wallet,source)
);
create table public.generator_wallet_events (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 wallet text not null check (wallet in ('generation','guidance','compare')),
 source text not null check (source in ('recurring','signup','reward','replacement','purchased','legacy')),
 amount integer not null check (amount <> 0),
 source_key text not null unique check (char_length(source_key) between 8 and 240),
 generation_request_id uuid references public.image_generation_requests(id) on delete set null,
 created_at timestamptz not null default now()
);
create index generator_wallet_events_owner_idx on public.generator_wallet_events(user_id,created_at desc,id desc);
create index generator_wallet_events_request_idx on public.generator_wallet_events(generation_request_id) where generation_request_id is not null;
create table public.generator_allowance_periods (
 user_id uuid not null references auth.users(id) on delete cascade,
 cadence text not null check(cadence in ('week','month')),
 period_start date not null,
 target integer not null check(target between 0 and 4),
 minted integer not null check(minted between 0 and 4),
 tier text not null check(tier in ('standard','plus','pro')),
 policy_version text not null default 'launch.2026-09-09',
 primary key(user_id,cadence,period_start)
);
alter table public.generator_wallet_sources enable row level security;
alter table public.generator_wallet_events enable row level security;
alter table public.generator_allowance_periods enable row level security;
revoke all on public.generator_wallet_sources, public.generator_wallet_events, public.generator_allowance_periods from public,anon,authenticated;
grant all on public.generator_wallet_sources, public.generator_wallet_events, public.generator_allowance_periods to service_role;
grant usage,select on sequence public.generator_wallet_events_id_seq to service_role;

insert into public.generator_wallet_sources(user_id,wallet,source,balance)
 select user_id,'generation','legacy',balance from public.generation_token_accounts;
insert into public.generator_wallet_events(user_id,wallet,source,amount,source_key)
 select user_id,'generation','legacy',balance,'legacy-import:'||user_id from public.generation_token_accounts where balance>0;

-- Every existing Generation mutation already locks its account row. Mirror
-- its ledger in the same transaction, so old workers/refunds cannot drift.
create function public.record_generation_wallet_sources() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare v_source text; v_left integer; v_take integer; v_row record; v_total bigint;
begin
 if new.amount>0 then
  v_source := case
   when new.event_type='wallet_credit' then new.metadata->>'wallet_source'
   when new.event_type in ('plus_weekly_mint','pro_weekly_mint','weekly_allowance') then 'recurring'
   when new.event_type='generator_issue_replacement' then 'replacement'
   when new.event_type='commission_refund' then 'replacement'
   else 'reward' end;
  -- A returned purchased token retains its purchased origin. Other returns
  -- are restitution, outside the recurring cap even when a new period began.
  if new.event_type='commission_refund' and exists (
   select 1 from public.generator_wallet_events where generation_request_id=new.generation_request_id
    and user_id=new.user_id and wallet='generation' and source='purchased' and amount<0
  ) then v_source:='purchased'; end if;
  insert into public.generator_wallet_sources(user_id,wallet,source,balance)
   values(new.user_id,'generation',v_source,new.amount)
   on conflict(user_id,wallet,source) do update set balance=public.generator_wallet_sources.balance+excluded.balance,updated_at=now();
  insert into public.generator_wallet_events(user_id,wallet,source,amount,source_key,generation_request_id)
   values(new.user_id,'generation',v_source,new.amount,'generation-ledger:'||new.id||':'||v_source,new.generation_request_id);
 elsif new.amount<0 then
  v_left:=-new.amount;
  for v_row in select * from public.generator_wallet_sources
   where user_id=new.user_id and wallet='generation' and balance>0
   order by case source when 'recurring' then 1 when 'signup' then 2 when 'reward' then 3 when 'legacy' then 4 when 'replacement' then 5 else 6 end
   for update
  loop
   v_take:=least(v_left,v_row.balance);
   update public.generator_wallet_sources set balance=balance-v_take,updated_at=now()
    where user_id=new.user_id and wallet='generation' and source=v_row.source;
   insert into public.generator_wallet_events(user_id,wallet,source,amount,source_key,generation_request_id)
    values(new.user_id,'generation',v_row.source,-v_take,'generation-ledger:'||new.id||':'||v_row.source,new.generation_request_id);
   v_left:=v_left-v_take;
   exit when v_left=0;
  end loop;
  if v_left<>0 then raise exception 'generation wallet source invariant violated'; end if;
 end if;
 select coalesce(sum(balance),0) into v_total from public.generator_wallet_sources where user_id=new.user_id and wallet='generation';
 if v_total<>new.balance_after then raise exception 'generation wallet balance invariant violated'; end if;
 return new;
end; $$;
revoke all on function public.record_generation_wallet_sources() from public,anon,authenticated;
grant execute on function public.record_generation_wallet_sources() to service_role;
create trigger generation_ledger_wallet_sources after insert on public.generation_token_ledger
 for each row execute function public.record_generation_wallet_sources();

-- Credits are trusted service operations only. No browser purchase/mint API.
create function public.credit_generator_wallet(p_user_id uuid,p_wallet text,p_source text,p_amount integer,p_source_key text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_existing public.generator_wallet_events%rowtype; v_balance integer;
begin
 if p_user_id is null or p_amount is null or p_amount<1 or p_wallet is null or p_wallet not in ('generation','guidance','compare')
  or p_source is null or p_source not in ('recurring','signup','reward','replacement','purchased')
  or p_source_key is null or char_length(p_source_key) not between 8 and 180 then raise exception 'invalid wallet credit'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,920));
 if p_wallet='generation' then
  return public.adjust_generation_token_balance(p_user_id,p_amount,'wallet_credit',p_source_key,
   public.effective_image_generator_tier(p_user_id),null,jsonb_build_object('wallet_source',p_source,'policy_version','launch.2026-09-09'));
 end if;
 select * into v_existing from public.generator_wallet_events where source_key=p_source_key;
 if found then
  if v_existing.user_id<>p_user_id or v_existing.wallet<>p_wallet or v_existing.source<>p_source or v_existing.amount<>p_amount
   then raise exception 'wallet source key reused'; end if;
  return jsonb_build_object('idempotent_replay',true);
 end if;
 insert into public.generator_wallet_sources(user_id,wallet,source,balance) values(p_user_id,p_wallet,p_source,p_amount)
  on conflict(user_id,wallet,source) do update set balance=public.generator_wallet_sources.balance+excluded.balance,updated_at=now()
  returning balance into v_balance;
 insert into public.generator_wallet_events(user_id,wallet,source,amount,source_key) values(p_user_id,p_wallet,p_source,p_amount,p_source_key);
 return jsonb_build_object('source_balance',v_balance,'idempotent_replay',false);
end; $$;
revoke all on function public.credit_generator_wallet(uuid,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.credit_generator_wallet(uuid,text,text,integer,text) to service_role;

-- UTC calendar periods. Visiting repeatedly cannot refill spent tokens within
-- a period. Tier upgrades grant only the difference; downgrades never confiscate.
create function public.grant_generator_launch_allowances(p_user_id uuid,p_at timestamptz default now())
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_tier text; v_target integer; v_cadence text; v_period date; v_previous integer:=0;
 v_balance integer; v_delta integer; v_reserved integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,920));
 v_tier:=public.effective_image_generator_tier(p_user_id);
 -- Separate one-time signup and retry grants. No provider call here.
 if v_tier='free' then
  perform public.credit_generator_wallet(p_user_id,'generation','signup',1,'signup-commission:'||p_user_id);
  perform public.credit_generator_wallet(p_user_id,'generation','signup',1,'signup-retry:'||p_user_id);
 end if;
 v_target:=case v_tier when 'standard' then 2 when 'plus' then 2 when 'pro' then 4 else 0 end;
 if v_target=0 then return jsonb_build_object('minted',0,'tier',v_tier); end if;
 v_cadence:=case when v_tier='standard' then 'month' else 'week' end;
 v_period:=(date_trunc(v_cadence,p_at at time zone 'UTC'))::date;
 select target into v_previous from public.generator_allowance_periods where user_id=p_user_id and cadence=v_cadence and period_start=v_period for update;
 v_previous:=coalesce(v_previous,0);
 -- Adopt already-recorded legacy weekly mints in the current period.
 if v_cadence='week' then
  select greatest(v_previous,coalesce(max(granted_amount),0)) into v_previous
   from public.generation_token_weekly_mints where user_id=p_user_id and week_start=v_period;
 end if;
 insert into public.generation_token_accounts(user_id) values(p_user_id) on conflict do nothing;
 perform 1 from public.generation_token_accounts where user_id=p_user_id for update;
 select coalesce(sum(balance),0)::integer into v_balance from public.generator_wallet_sources where user_id=p_user_id and wallet='generation' and source='recurring';
 -- Reservations also occupy allowance capacity until spent/refunded.
 select coalesce(sum(-e.amount),0)::integer into v_reserved from public.generator_wallet_events e
  join public.generation_token_redemptions r on r.generation_request_id=e.generation_request_id
  where e.user_id=p_user_id and e.wallet='generation' and e.source='recurring' and e.amount<0 and r.state='reserved';
 v_delta:=least(greatest(v_target-v_previous,0),greatest(2*v_target-v_balance-v_reserved,0));
 if v_delta>0 then
  perform public.credit_generator_wallet(p_user_id,'generation','recurring',v_delta,
   'launch-allowance:'||p_user_id||':'||v_cadence||':'||v_period||':'||v_target);
 end if;
 insert into public.generator_allowance_periods(user_id,cadence,period_start,target,minted,tier)
  values(p_user_id,v_cadence,v_period,greatest(v_previous,v_target),v_delta,v_tier)
  on conflict(user_id,cadence,period_start) do update set target=greatest(public.generator_allowance_periods.target,excluded.target),
   minted=public.generator_allowance_periods.minted+excluded.minted,tier=excluded.tier;
 return jsonb_build_object('minted',v_delta,'tier',v_tier,'cap',2*v_target);
end; $$;
revoke all on function public.grant_generator_launch_allowances(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.grant_generator_launch_allowances(uuid,timestamptz) to service_role;

create or replace function public.mint_weekly_generation_tokens(p_user_id uuid,p_week_start date default (date_trunc('week',now() at time zone 'utc'))::date)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin return public.grant_generator_launch_allowances(p_user_id,p_week_start::timestamp at time zone 'UTC'); end; $$;
revoke all on function public.mint_weekly_generation_tokens(uuid,date) from public,anon,authenticated;
grant execute on function public.mint_weekly_generation_tokens(uuid,date) to service_role;

create or replace function public.mint_due_generation_token_allowances(p_limit integer default 100)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_row record; v_results jsonb:='[]'::jsonb;
begin
 for v_row in
  select distinct e.user_id from public.membership_entitlements e
  cross join lateral (select public.effective_image_generator_tier(e.user_id) tier) t
  where e.status='active' and (e.valid_until is null or e.valid_until>now())
   and t.tier in ('standard','plus','pro')
   and not exists(select 1 from public.generator_allowance_periods p where p.user_id=e.user_id
    and p.cadence=case when t.tier='standard' then 'month' else 'week' end
    and p.period_start=(date_trunc(case when t.tier='standard' then 'month' else 'week' end,now() at time zone 'UTC'))::date
    and p.target>=case when t.tier='pro' then 4 else 2 end)
  order by e.user_id limit least(500,greatest(1,p_limit))
 loop
  v_results:=v_results||jsonb_build_array(public.grant_generator_launch_allowances(v_row.user_id));
 end loop;
 return v_results;
end; $$;
revoke all on function public.mint_due_generation_token_allowances(integer) from public,anon,authenticated;
grant execute on function public.mint_due_generation_token_allowances(integer) to service_role;


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
          and lower(coalesce(e.metadata ->> 'plan', 'pro')) not in ('standard','plus')
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

  if v_tier = 'free' and exists (
    select 1 from public.membership_entitlements e where e.user_id=p_user_id and e.status='active'
      and (e.valid_until is null or e.valid_until>now())
      and (e.entitlement in ('membership_standard','generation_standard') or lower(coalesce(e.metadata->>'plan',''))='standard')
  ) then return 'standard'; end if;
  return v_tier;
end;
$$;

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
    'wallet_credit', 'rating_bracket_award', 'weekly_allowance',
    'membership_anniversary', 'support_adjustment'
  ) then raise exception 'invalid token adjustment event type'; end if;
  if p_membership_tier not in ('free', 'standard', 'plus', 'pro', 'internal_unlimited') then
    raise exception 'invalid membership tier';
  end if;
  if char_length(trim(coalesce(p_source_key, ''))) not between 8 and 200 then
    raise exception 'source key must be 8-200 characters';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,920));

  select * into v_existing
  from public.generation_token_ledger
  where source_key = trim(p_source_key);

  if found then
    if v_existing.user_id <> p_user_id
      or v_existing.amount <> p_amount
      or v_existing.event_type <> p_event_type
      or (p_event_type='wallet_credit' and v_existing.metadata->>'wallet_source' is distinct from p_metadata->>'wallet_source') then
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
    when 'standard' then 1
    when 'plus' then 2
    when 'pro' then 3
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

  perform public.grant_generator_launch_allowances(p_owner_id);

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

create or replace function public.create_saved_creation_evolution(
  p_owner_id uuid,
  p_saved_creation_id uuid,
  p_prompt text,
  p_idempotency_key text,
  p_reference_ids uuid[] default '{}'::uuid[],
  p_provider text default 'unconfigured',
  p_model text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_parent public.image_saved_creations%rowtype;
  v_existing public.image_generation_requests%rowtype;
  v_request jsonb;
  v_request_id uuid;
  v_reference_1 uuid;
  v_reference_2 uuid;
begin
  if p_reference_ids is null then p_reference_ids := '{}'::uuid[]; end if;
  if array_position(p_reference_ids, null) is not null then
    raise exception 'reference ids cannot contain null';
  end if;
  if cardinality(p_reference_ids) <> cardinality(array(select distinct unnest(p_reference_ids))) then
    raise exception 'reference ids must be distinct';
  end if;
  if cardinality(p_reference_ids) > 2 then
    raise exception 'reference count exceeds effective membership tier';
  end if;
  v_reference_1 := p_reference_ids[1];
  v_reference_2 := p_reference_ids[2];

  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 719));

  select * into v_existing
  from public.image_generation_requests
  where owner_id = p_owner_id and idempotency_key = trim(p_idempotency_key)
  for update;
  if found then
    if v_existing.parent_saved_creation_id is distinct from p_saved_creation_id
      or v_existing.prompt <> trim(p_prompt)
      or v_existing.reference_id is distinct from v_reference_1
      or v_existing.reference_id_2 is distinct from v_reference_2 then
      raise exception 'idempotency key reused with different saved creation';
    end if;
    return to_jsonb(v_existing) - 'failure_detail';
  end if;

  v_tier := public.effective_image_generator_tier(p_owner_id);
  if v_tier not in ('pro', 'internal_unlimited') then
    raise exception 'furthering a saved creation requires Pro';
  end if;
  select * into v_parent
  from public.image_saved_creations
  where id = p_saved_creation_id and owner_id = p_owner_id and status = 'active'
  for update;
  if not found then raise exception 'saved creation not found'; end if;

  v_request := public.create_image_generation_request_with_references(
    p_owner_id, p_prompt, (case when v_tier='pro' then 3 else 5 end)::smallint, p_idempotency_key,
    p_reference_ids, p_provider, p_model
  );
  v_request_id := (v_request ->> 'id')::uuid;
  update public.image_generation_requests
  set parent_saved_creation_id = p_saved_creation_id, updated_at = now()
  where id = v_request_id and parent_saved_creation_id is null;
  if not found then raise exception 'saved creation evolution could not be bound'; end if;
  return (
    select to_jsonb(r) - 'failure_detail'
    from public.image_generation_requests r where id = v_request_id
  );
end;
$$;

commit;
