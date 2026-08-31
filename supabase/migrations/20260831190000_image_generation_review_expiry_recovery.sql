-- Enforce the 24-hour private review window even when no player action occurs.
-- Candidate objects remain private and are not deleted here because retention is
-- a separate owner-approved policy decision.

begin;

create index image_generation_requests_review_expiry_idx
  on public.image_generation_requests (review_expires_at, id)
  where status = 'review';

create index image_generation_refinements_request_active_idx
  on public.image_generation_refinements (request_id)
  where status in ('queued', 'running');

create or replace function public.claim_next_image_generation_refinement()
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
  where f.status = 'queued'
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

create or replace function public.expire_due_image_generation_reviews(
  p_limit integer default 50
)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.image_generation_requests%rowtype;
  v_candidate_count integer;
  v_refinement_count integer;
begin
  for v_request in
    select r.*
    from public.image_generation_requests r
    where r.status = 'review'
      and r.review_expires_at is not null
      and r.review_expires_at <= now()
      and not exists (
        select 1
        from public.image_generation_refinements f
        where f.request_id = r.id and f.status = 'running'
      )
    order by r.review_expires_at, r.id
    for update of r skip locked
    limit greatest(1, least(p_limit, 200))
  loop
    update public.image_generation_refinements
    set status = 'cancelled',
        completed_at = now(),
        failure_code = 'review_window_expired',
        failure_detail = 'The commission review window expired before this refinement was claimed.',
        updated_at = now()
    where request_id = v_request.id and status = 'queued';
    get diagnostics v_refinement_count = row_count;

    update public.image_generation_candidates
    set status = 'expired', updated_at = now()
    where request_id = v_request.id and status = 'review';
    get diagnostics v_candidate_count = row_count;

    update public.image_generation_requests
    set status = 'expired', updated_at = now()
    where id = v_request.id and status = 'review';

    return next jsonb_build_object(
      'request_id', v_request.id,
      'expired_candidate_count', v_candidate_count,
      'cancelled_refinement_count', v_refinement_count
    );
  end loop;
end;
$$;

revoke all on function public.claim_next_image_generation_refinement()
  from public, anon, authenticated;
revoke all on function public.expire_due_image_generation_reviews(integer)
  from public, anon, authenticated;
grant execute on function public.claim_next_image_generation_refinement()
  to service_role;
grant execute on function public.expire_due_image_generation_reviews(integer)
  to service_role;

commit;
