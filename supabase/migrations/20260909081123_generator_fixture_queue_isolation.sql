begin;
drop function public.claim_next_image_generation_request();
create or replace function public.claim_next_image_generation_request(p_provider text default 'vercel_ai_gateway')
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
  where r.provider = p_provider and r.status = 'queued'
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
revoke all on function public.claim_next_image_generation_request(text) from public,anon,authenticated;
grant execute on function public.claim_next_image_generation_request(text) to service_role;
drop function public.claim_next_image_generation_refinement();
create or replace function public.claim_next_image_generation_refinement(p_provider text default 'vercel_ai_gateway')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_refinement public.image_generation_refinements%rowtype;
begin
  select f.* into v_refinement
  from public.image_generation_refinements f
  join public.image_generation_requests r on r.id = f.request_id
  where f.provider = p_provider and f.status = 'queued'
    and f.next_attempt_at <= now()
    and r.status = 'review'
    and r.review_expires_at > now()
  order by f.next_attempt_at, f.created_at, f.id
  for update of f skip locked
  limit 1;
  if not found then return null; end if;

  update public.image_generation_refinements
  set status = 'running', attempt_count = attempt_count + 1,
      claimed_at = now(), updated_at = now()
  where id = v_refinement.id
  returning * into v_refinement;

  return jsonb_build_object(
    'id', v_refinement.id,
    'request_id', v_refinement.request_id,
    'owner_id', v_refinement.owner_id,
    'source_candidate_id', v_refinement.source_candidate_id,
    'guidance', v_refinement.guidance,
    'provider', v_refinement.provider,
    'model', v_refinement.model,
    'candidate_ordinal_start', v_refinement.candidate_ordinal_start,
    'attempt_count', v_refinement.attempt_count
  );
end;
$$;
revoke all on function public.claim_next_image_generation_refinement(text) from public,anon,authenticated;
grant execute on function public.claim_next_image_generation_refinement(text) to service_role;
commit;
