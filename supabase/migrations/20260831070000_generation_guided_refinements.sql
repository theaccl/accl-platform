-- Plus and Pro guided refinement jobs remain inside the original paid
-- commission. They never reserve or spend another Generation Token.

begin;

create table public.image_generation_refinements (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.image_generation_requests(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_candidate_id uuid not null references public.image_generation_candidates(id) on delete restrict,
  ordinal smallint not null check (ordinal between 1 and 4),
  guidance text not null check (char_length(trim(guidance)) between 1 and 1000),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'review', 'failed', 'cancelled')),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  provider text not null,
  model text,
  candidate_ordinal_start smallint not null check (candidate_ordinal_start between 4 and 12),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 3),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  failure_code text,
  failure_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, ordinal),
  unique (owner_id, idempotency_key)
);

alter table public.image_generation_candidates
  add column refinement_id uuid
    references public.image_generation_refinements(id) on delete restrict;

create unique index image_generation_candidates_refinement_ordinal_idx
  on public.image_generation_candidates (refinement_id, ordinal)
  where refinement_id is not null;
create index image_generation_refinements_queue_idx
  on public.image_generation_refinements (next_attempt_at, created_at, id)
  where status = 'queued';
create index image_generation_refinements_owner_idx
  on public.image_generation_refinements (owner_id, created_at desc);

alter table public.image_generation_refinements enable row level security;
create policy image_generation_refinements_select_own
  on public.image_generation_refinements for select to authenticated
  using (owner_id = (select auth.uid()));
revoke all on public.image_generation_refinements from anon, authenticated;
grant select on public.image_generation_refinements to authenticated;
grant all on public.image_generation_refinements to service_role;

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
    when 'plus' then 1
    when 'pro' then 4
    when 'internal_unlimited' then 4
    else 0
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

create or replace function public.claim_next_image_generation_refinement()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_refinement public.image_generation_refinements%rowtype;
begin
  select * into v_refinement from public.image_generation_refinements
  where status = 'queued' and next_attempt_at <= now()
  order by next_attempt_at, created_at, id
  for update skip locked limit 1;
  if not found then return null; end if;

  update public.image_generation_refinements
  set status = 'running', attempt_count = attempt_count + 1,
      claimed_at = now(), updated_at = now()
  where id = v_refinement.id returning * into v_refinement;

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

create or replace function public.register_image_generation_refinement_candidate(
  p_refinement_id uuid,
  p_ordinal smallint,
  p_storage_path text,
  p_mime_type text,
  p_byte_size bigint,
  p_width integer,
  p_height integer,
  p_sha256 text,
  p_moderation_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refinement public.image_generation_refinements%rowtype;
  v_candidate public.image_generation_candidates%rowtype;
begin
  select * into v_refinement from public.image_generation_refinements
  where id = p_refinement_id for update;
  if not found or v_refinement.status <> 'running' then
    raise exception 'refinement must be running';
  end if;
  if p_ordinal not between v_refinement.candidate_ordinal_start
    and v_refinement.candidate_ordinal_start + 1 then
    raise exception 'candidate ordinal outside refinement range';
  end if;
  if left(p_storage_path, 37) <> (v_refinement.owner_id::text || '/') then
    raise exception 'candidate storage path must be owner-namespaced';
  end if;
  if p_moderation_status <> 'approved' then
    raise exception 'candidate must pass moderation before registration';
  end if;

  insert into public.image_generation_candidates (
    request_id, owner_id, ordinal, status, storage_path, mime_type,
    byte_size, width, height, sha256, moderation_status, refinement_id
  ) values (
    v_refinement.request_id, v_refinement.owner_id, p_ordinal, 'review',
    p_storage_path, p_mime_type, p_byte_size, p_width, p_height,
    nullif(trim(p_sha256), ''), p_moderation_status, p_refinement_id
  ) returning * into v_candidate;
  return to_jsonb(v_candidate);
end;
$$;

create or replace function public.finalize_image_generation_refinement(
  p_refinement_id uuid,
  p_succeeded boolean,
  p_failure_code text default null,
  p_failure_detail text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_candidate_count integer;
begin
  if p_succeeded then
    select count(*)::integer into v_candidate_count
    from public.image_generation_candidates
    where refinement_id = p_refinement_id and status = 'review'
      and moderation_status = 'approved';
    if v_candidate_count <> 2 then raise exception 'successful refinement requires two candidates'; end if;
  end if;

  update public.image_generation_refinements
  set status = case when p_succeeded then 'review' else 'failed' end,
      completed_at = now(), updated_at = now(),
      failure_code = case when p_succeeded then null else left(nullif(trim(p_failure_code), ''), 100) end,
      failure_detail = case when p_succeeded then null else left(p_failure_detail, 2000) end
  where id = p_refinement_id and status = 'running';
  return found;
end;
$$;

create or replace function public.retry_or_fail_image_generation_refinement(
  p_refinement_id uuid,
  p_failure_code text,
  p_failure_detail text,
  p_retryable boolean,
  p_retry_after_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_refinement public.image_generation_refinements%rowtype;
begin
  select * into v_refinement from public.image_generation_refinements
  where id = p_refinement_id for update;
  if not found or v_refinement.status <> 'running' then
    return jsonb_build_object('status', coalesce(v_refinement.status, 'missing'));
  end if;
  delete from public.image_generation_candidates where refinement_id = p_refinement_id;

  update public.image_generation_refinements
  set status = case when p_retryable and attempt_count < 3 then 'queued' else 'failed' end,
      next_attempt_at = case when p_retryable and attempt_count < 3
        then now() + make_interval(secs => greatest(1, least(p_retry_after_seconds, 300)))
        else next_attempt_at end,
      completed_at = case when p_retryable and attempt_count < 3 then null else now() end,
      failure_code = left(nullif(trim(p_failure_code), ''), 100),
      failure_detail = left(p_failure_detail, 2000), updated_at = now()
  where id = p_refinement_id returning * into v_refinement;
  return jsonb_build_object('status', v_refinement.status, 'attempt_count', v_refinement.attempt_count);
end;
$$;

-- Acceptance cannot race a queued/running refinement job.
create or replace function public.approve_image_generation_candidate(
  p_owner_id uuid,
  p_request_id uuid,
  p_candidate_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.image_generation_requests%rowtype;
  v_candidate public.image_generation_candidates%rowtype;
begin
  select * into v_request from public.image_generation_requests
  where id = p_request_id and owner_id = p_owner_id for update;
  if not found then raise exception 'request not found'; end if;
  if v_request.status <> 'review' then raise exception 'request is not awaiting review'; end if;
  if exists (
    select 1 from public.image_generation_refinements
    where request_id = p_request_id and status in ('queued', 'running')
  ) then raise exception 'guided refinement is still processing'; end if;
  if v_request.review_expires_at is null or v_request.review_expires_at <= now() then
    update public.image_generation_requests set status = 'expired', updated_at = now() where id = p_request_id;
    update public.image_generation_candidates set status = 'expired', updated_at = now()
      where request_id = p_request_id and status = 'review';
    return jsonb_build_object('error', 'review_window_expired');
  end if;

  select * into v_candidate from public.image_generation_candidates
  where id = p_candidate_id and request_id = p_request_id and owner_id = p_owner_id
    and status = 'review' and moderation_status = 'approved'
  for update;
  if not found then raise exception 'candidate is not approvable'; end if;

  update public.image_generation_candidates
  set status = case when id = p_candidate_id then 'approved' else 'rejected' end,
      approved_at = case when id = p_candidate_id then now() else approved_at end,
      updated_at = now()
  where request_id = p_request_id and status = 'review';
  update public.image_generation_requests set status = 'approved', updated_at = now()
    where id = p_request_id;
  insert into public.image_generation_approval_events (request_id, candidate_id, owner_id, event_type)
    values (p_request_id, p_candidate_id, p_owner_id, 'approved');
  return (select to_jsonb(c) from public.image_generation_candidates c where c.id = p_candidate_id);
end;
$$;

revoke all on function public.create_image_generation_refinement(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.claim_next_image_generation_refinement()
  from public, anon, authenticated;
revoke all on function public.register_image_generation_refinement_candidate(
  uuid, smallint, text, text, bigint, integer, integer, text, text
) from public, anon, authenticated;
revoke all on function public.finalize_image_generation_refinement(uuid, boolean, text, text)
  from public, anon, authenticated;
revoke all on function public.retry_or_fail_image_generation_refinement(uuid, text, text, boolean, integer)
  from public, anon, authenticated;
revoke all on function public.approve_image_generation_candidate(uuid, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.create_image_generation_refinement(uuid, uuid, uuid, text, text)
  to service_role;
grant execute on function public.claim_next_image_generation_refinement() to service_role;
grant execute on function public.register_image_generation_refinement_candidate(
  uuid, smallint, text, text, bigint, integer, integer, text, text
) to service_role;
grant execute on function public.finalize_image_generation_refinement(uuid, boolean, text, text)
  to service_role;
grant execute on function public.retry_or_fail_image_generation_refinement(uuid, text, text, boolean, integer)
  to service_role;
grant execute on function public.approve_image_generation_candidate(uuid, uuid, uuid)
  to service_role;

commit;
