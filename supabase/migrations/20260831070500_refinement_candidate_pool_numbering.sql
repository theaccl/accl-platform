-- Number refinement candidates after the complete tier opening pool, even if a
-- partial provider result is being inspected during staging diagnostics.

begin;

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
  select * into v_request from public.image_generation_requests
  where id = p_request_id and owner_id = p_owner_id for update;
  if not found then raise exception 'generation request not found'; end if;
  if v_request.status <> 'review' or v_request.review_expires_at is null
    or v_request.review_expires_at <= now() then
    raise exception 'generation request is not awaiting review';
  end if;

  v_max_refinements := case v_request.membership_tier
    when 'plus' then 1 when 'pro' then 4 when 'internal_unlimited' then 4 else 0
  end;
  if v_max_refinements = 0 then raise exception 'guided refinement requires Plus or Pro'; end if;

  select * into v_existing from public.image_generation_refinements
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

  if exists (
    select 1 from public.image_generation_refinements
    where request_id = p_request_id and status in ('queued', 'running')
  ) then raise exception 'another guided refinement is already processing'; end if;

  select * into v_candidate from public.image_generation_candidates
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

revoke all on function public.create_image_generation_refinement(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.create_image_generation_refinement(uuid, uuid, uuid, text, text)
  to service_role;

commit;
