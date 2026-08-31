-- Allow exact Internal Unlimited emails to be approved before the Auth account
-- exists. Access still requires a currently verified Auth email match.

begin;

alter table public.internal_generator_unlimited_grants
  drop constraint internal_generator_unlimited_grants_pkey,
  alter column user_id drop not null,
  add column id bigint generated always as identity primary key;

create unique index internal_generator_unlimited_user_idx
  on public.internal_generator_unlimited_grants (user_id)
  where user_id is not null;

comment on column public.internal_generator_unlimited_grants.user_id is
  'Attached Auth user after the approved exact email exists; may be null while approval is pending signup/verification.';

create or replace function public.set_internal_generator_unlimited_by_email(
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
  v_user_id uuid;
  v_email_verified boolean := false;
  v_grant public.internal_generator_unlimited_grants%rowtype;
begin
  if char_length(v_email) not between 3 and 320 then
    raise exception 'valid email required';
  end if;

  select u.id, u.email_confirmed_at is not null
  into v_user_id, v_email_verified
  from auth.users u
  where lower(u.email) = v_email
  order by u.created_at desc
  limit 1;

  insert into public.internal_generator_unlimited_grants (
    user_id, email_normalized, status, reason, revoked_at
  ) values (
    case when v_email_verified then v_user_id else null end,
    v_email,
    case when p_active then 'active' else 'revoked' end,
    nullif(trim(coalesce(p_reason, '')), ''),
    case when p_active then null else now() end
  )
  on conflict (email_normalized) do update set
    user_id = coalesce(excluded.user_id, public.internal_generator_unlimited_grants.user_id),
    status = excluded.status,
    reason = excluded.reason,
    revoked_at = excluded.revoked_at,
    updated_at = now()
  returning * into v_grant;

  return jsonb_build_object(
    'user_id', v_grant.user_id,
    'email', v_grant.email_normalized,
    'status', v_grant.status,
    'activation', case
      when v_grant.status <> 'active' then 'revoked'
      when v_email_verified then 'active'
      else 'pending_verified_signup'
    end,
    'updated_at', v_grant.updated_at
  );
end;
$$;

revoke all on function public.set_internal_generator_unlimited_by_email(text, boolean, text) from public;
grant execute on function public.set_internal_generator_unlimited_by_email(text, boolean, text) to service_role;

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
    from auth.users u
    join public.internal_generator_unlimited_grants g
      on g.email_normalized = lower(u.email)
    where u.id = p_owner_id
      and u.email_confirmed_at is not null
      and g.status = 'active'
      and (g.user_id is null or g.user_id = u.id)
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
    update public.internal_generator_unlimited_grants g
    set user_id = p_owner_id, updated_at = now()
    from auth.users u
    where u.id = p_owner_id
      and g.email_normalized = lower(u.email)
      and g.user_id is null;

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
