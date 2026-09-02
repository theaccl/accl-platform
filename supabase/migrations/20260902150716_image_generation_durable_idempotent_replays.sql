-- Exact retries must return the original commission/refinement even after the
-- player's entitlement, reference lifecycle, candidate state, or review state
-- has changed. Payload mismatches remain rejected before any new token or
-- provider work can be created.

begin;

create or replace function public.create_image_generation_request_with_references(
  p_owner_id uuid,
  p_prompt text,
  p_candidate_count smallint,
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
  v_max_references integer;
  v_reference_count integer;
  v_reference_id uuid;
  v_reference_1 uuid;
  v_reference_2 uuid;
  v_request jsonb;
  v_request_id uuid;
  v_existing public.image_generation_requests%rowtype;
  v_reference public.image_generation_references%rowtype;
begin
  if p_reference_ids is null then p_reference_ids := '{}'::uuid[]; end if;
  if array_position(p_reference_ids, null) is not null then
    raise exception 'reference ids cannot contain null';
  end if;
  v_reference_count := cardinality(p_reference_ids);
  if v_reference_count <> cardinality(array(select distinct unnest(p_reference_ids))) then
    raise exception 'reference ids must be distinct';
  end if;
  if v_reference_count > 2 then
    raise exception 'reference count exceeds effective membership tier';
  end if;

  v_reference_1 := p_reference_ids[1];
  v_reference_2 := p_reference_ids[2];

  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 716));

  select * into v_existing
  from public.image_generation_requests r
  where r.owner_id = p_owner_id and r.idempotency_key = trim(p_idempotency_key)
  for update;

  if found then
    if v_existing.prompt <> trim(p_prompt)
      or v_existing.reference_id is distinct from v_reference_1
      or v_existing.reference_id_2 is distinct from v_reference_2
      or v_existing.parent_saved_creation_id is not null then
      raise exception 'idempotency key reused with different request';
    end if;
    return to_jsonb(v_existing) - 'failure_detail';
  end if;

  v_tier := public.effective_image_generator_tier(p_owner_id);
  v_max_references := case when v_tier in ('pro', 'internal_unlimited') then 2 else 1 end;
  if v_reference_count > v_max_references then
    raise exception 'reference count exceeds effective membership tier';
  end if;

  foreach v_reference_id in array p_reference_ids loop
    select * into v_reference
    from public.image_generation_references r
    where r.id = v_reference_id and r.owner_id = p_owner_id
    for update;
    if not found or v_reference.status <> 'ready' or v_reference.expires_at <= now() then
      raise exception 'reference image is unavailable';
    end if;
    if v_reference.request_id is not null then
      raise exception 'reference image was already used';
    end if;
  end loop;

  v_request := public.create_image_generation_request(
    p_owner_id,
    p_prompt,
    p_candidate_count,
    p_idempotency_key,
    v_reference_1,
    p_provider,
    p_model
  );
  v_request_id := (v_request ->> 'id')::uuid;

  update public.image_generation_requests
  set reference_id_2 = v_reference_2, updated_at = now()
  where id = v_request_id and reference_id_2 is null;
  if not found then raise exception 'image generation request could not be bound'; end if;

  foreach v_reference_id in array p_reference_ids loop
    update public.image_generation_references
    set request_id = v_request_id, updated_at = now()
    where id = v_reference_id and request_id is null;
    if not found then raise exception 'reference image was already used'; end if;
  end loop;

  return (
    select to_jsonb(r) - 'failure_detail'
    from public.image_generation_requests r
    where r.id = v_request_id
  );
end;
$$;

create or replace function public.create_image_generation_refinement(
  p_owner_id uuid,
  p_request_id uuid,
  p_source_candidate_id uuid,
  p_guidance text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.image_generation_requests%rowtype;
  v_candidate public.image_generation_candidates%rowtype;
  v_existing public.image_generation_refinements%rowtype;
  v_refinement public.image_generation_refinements%rowtype;
  v_max_refinements smallint;
  v_next_ordinal smallint;
  v_candidate_start smallint;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 718));

  select * into v_existing
  from public.image_generation_refinements
  where owner_id = p_owner_id and idempotency_key = trim(p_idempotency_key)
  for update;
  if found then
    if v_existing.request_id <> p_request_id
      or v_existing.source_candidate_id <> p_source_candidate_id
      or v_existing.guidance <> trim(p_guidance) then
      raise exception 'idempotency key reused with different refinement';
    end if;
    return to_jsonb(v_existing) - 'failure_detail';
  end if;

  select * into v_request
  from public.image_generation_requests
  where id = p_request_id and owner_id = p_owner_id
  for update;
  if not found then raise exception 'generation request not found'; end if;
  if v_request.status <> 'review' or v_request.review_expires_at is null
    or v_request.review_expires_at <= now() then
    raise exception 'generation request is not awaiting review';
  end if;

  v_max_refinements := case v_request.membership_tier
    when 'plus' then 1 when 'pro' then 4 when 'internal_unlimited' then 4 else 0
  end;
  if v_max_refinements = 0 then raise exception 'guided refinement requires Plus or Pro'; end if;

  if exists (
    select 1 from public.image_generation_refinements
    where request_id = p_request_id and status in ('queued', 'running')
  ) then raise exception 'another guided refinement is already processing'; end if;

  select * into v_candidate
  from public.image_generation_candidates
  where id = p_source_candidate_id and request_id = p_request_id
    and owner_id = p_owner_id and status = 'review'
    and moderation_status = 'approved'
  for update;
  if not found then raise exception 'source candidate is not available for refinement'; end if;

  select coalesce(max(ordinal), 0)::smallint + 1 into v_next_ordinal
  from public.image_generation_refinements where request_id = p_request_id;
  if v_next_ordinal > v_max_refinements then
    raise exception 'guided refinement allowance exhausted';
  end if;

  select greatest(coalesce(max(ordinal), 0), v_request.candidate_count)::smallint + 1
    into v_candidate_start
  from public.image_generation_candidates where request_id = p_request_id;
  if v_candidate_start + 1 > 13 then raise exception 'commission review pool is full'; end if;

  insert into public.image_generation_refinements (
    request_id, owner_id, source_candidate_id, ordinal, guidance,
    idempotency_key, provider, model, candidate_ordinal_start
  ) values (
    p_request_id, p_owner_id, p_source_candidate_id, v_next_ordinal,
    trim(p_guidance), trim(p_idempotency_key), v_request.provider,
    v_request.model, v_candidate_start
  ) returning * into v_refinement;
  return to_jsonb(v_refinement) - 'failure_detail';
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
      or v_existing.candidate_count <> 5
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
    p_owner_id, p_prompt, 5::smallint, p_idempotency_key,
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

revoke all on function public.create_image_generation_request_with_references(
  uuid, text, smallint, text, uuid[], text, text
) from public, anon, authenticated;
revoke all on function public.create_image_generation_refinement(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.create_saved_creation_evolution(uuid, uuid, text, text, uuid[], text, text)
  from public, anon, authenticated;

grant execute on function public.create_image_generation_request_with_references(
  uuid, text, smallint, text, uuid[], text, text
) to service_role;
grant execute on function public.create_image_generation_refinement(uuid, uuid, uuid, text, text)
  to service_role;
grant execute on function public.create_saved_creation_evolution(uuid, uuid, text, text, uuid[], text, text)
  to service_role;

commit;
