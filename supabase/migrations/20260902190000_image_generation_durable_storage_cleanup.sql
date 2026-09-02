-- Keep candidate-object cleanup durable across transient Storage failures and
-- interrupted workers. Cleanup jobs are server-only and preserve exact paths
-- even after the candidate or disposable test user has been removed.

begin;

create table public.image_generation_storage_cleanup_jobs (
  id bigint generated always as identity primary key,
  bucket text not null check (bucket = 'image-generation-candidates'),
  storage_path text not null,
  request_id uuid,
  refinement_id uuid,
  reason text not null check (char_length(trim(reason)) between 1 and 100),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket, storage_path)
);

comment on table public.image_generation_storage_cleanup_jobs is
  'Service-only outbox for retryable deletion of private Image Generator objects.';

create index image_generation_storage_cleanup_jobs_due_idx
  on public.image_generation_storage_cleanup_jobs (next_attempt_at, id)
  where status = 'pending';

alter table public.image_generation_storage_cleanup_jobs enable row level security;
revoke all on public.image_generation_storage_cleanup_jobs from anon, authenticated;
grant all on public.image_generation_storage_cleanup_jobs to service_role;
grant usage, select on sequence public.image_generation_storage_cleanup_jobs_id_seq
  to service_role;

create or replace function public.claim_image_generation_storage_cleanup_jobs(
  p_limit integer default 20,
  p_stale_after_seconds integer default 600
)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.image_generation_storage_cleanup_jobs%rowtype;
begin
  update public.image_generation_storage_cleanup_jobs
  set status = 'pending', claimed_at = null, next_attempt_at = now(), updated_at = now()
  where status = 'running'
    and claimed_at < now() - make_interval(
      secs => greatest(60, least(p_stale_after_seconds, 3600))
    );

  for v_job in
    select *
    from public.image_generation_storage_cleanup_jobs
    where status = 'pending' and next_attempt_at <= now()
    order by next_attempt_at, id
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  loop
    update public.image_generation_storage_cleanup_jobs
    set status = 'running', claimed_at = now(),
        attempt_count = attempt_count + 1, updated_at = now()
    where id = v_job.id
    returning * into v_job;

    return next jsonb_build_object(
      'id', v_job.id,
      'bucket', v_job.bucket,
      'storage_path', v_job.storage_path,
      'attempt_count', v_job.attempt_count
    );
  end loop;
end;
$$;

create or replace function public.finalize_image_generation_storage_cleanup_job(
  p_job_id bigint,
  p_succeeded boolean,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.image_generation_storage_cleanup_jobs
  set status = case when p_succeeded then 'completed' else 'pending' end,
      claimed_at = null,
      completed_at = case when p_succeeded then now() else null end,
      next_attempt_at = case
        when p_succeeded then next_attempt_at
        else now() + make_interval(
          secs => least(3600, 30 * power(2, least(attempt_count, 7))::integer)
        )
      end,
      last_error = case when p_succeeded then null else left(coalesce(p_error, 'storage_cleanup_failed'), 1000) end,
      updated_at = now()
  where id = p_job_id and status = 'running';
  return found;
end;
$$;

create or replace function public.retry_or_fail_image_generation_request(
  p_request_id uuid,
  p_retryable boolean,
  p_failure_code text default null,
  p_failure_detail text default null,
  p_retry_after_seconds integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.image_generation_requests%rowtype;
  v_retry boolean;
begin
  select * into v_request
  from public.image_generation_requests
  where id = p_request_id
  for update;

  if not found or v_request.status <> 'running' then return null; end if;
  v_retry := p_retryable and v_request.attempt_count < 3;

  insert into public.image_generation_storage_cleanup_jobs (
    bucket, storage_path, request_id, refinement_id, reason
  )
  select 'image-generation-candidates', c.storage_path, c.request_id,
         c.refinement_id, 'opening_retry_or_failure'
  from public.image_generation_candidates c
  where c.request_id = p_request_id and c.status = 'review'
  on conflict (bucket, storage_path) do update
  set status = 'pending', claimed_at = null, completed_at = null,
      next_attempt_at = now(), last_error = null,
      updated_at = now();

  delete from public.image_generation_candidates
  where request_id = p_request_id and status = 'review';

  update public.image_generation_requests
  set status = case when v_retry then 'queued' else 'failed' end,
      claimed_at = case when v_retry then null else claimed_at end,
      next_attempt_at = case
        when v_retry then now() + make_interval(secs => least(300, greatest(1, p_retry_after_seconds)))
        else next_attempt_at
      end,
      completed_at = case when v_retry then null else now() end,
      failure_code = nullif(trim(p_failure_code), ''),
      failure_detail = left(p_failure_detail, 2000),
      updated_at = now()
  where id = p_request_id;

  if not v_retry then
    perform public.transition_generation_token_redemption(p_request_id, 'refund');
  end if;

  return jsonb_build_object(
    'request_id', p_request_id,
    'status', case when v_retry then 'queued' else 'failed' end,
    'attempt_count', v_request.attempt_count
  );
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

  insert into public.image_generation_storage_cleanup_jobs (
    bucket, storage_path, request_id, refinement_id, reason
  )
  select 'image-generation-candidates', c.storage_path, c.request_id,
         c.refinement_id, 'refinement_retry_or_failure'
  from public.image_generation_candidates c
  where c.refinement_id = p_refinement_id
  on conflict (bucket, storage_path) do update
  set status = 'pending', claimed_at = null, completed_at = null,
      next_attempt_at = now(), last_error = null,
      updated_at = now();

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

create or replace function public.recover_stale_image_generation_requests(
  p_stale_after_seconds integer default 360,
  p_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recovered jsonb;
begin
  with stale as (
    select r.id, r.attempt_count
    from public.image_generation_requests r
    where r.status = 'running'
      and r.claimed_at < now() - make_interval(secs => least(3600, greatest(60, p_stale_after_seconds)))
    order by r.claimed_at, r.id
    for update skip locked
    limit least(50, greatest(1, p_limit))
  ), enqueued as (
    insert into public.image_generation_storage_cleanup_jobs (
      bucket, storage_path, request_id, refinement_id, reason
    )
    select 'image-generation-candidates', c.storage_path, c.request_id,
           c.refinement_id, 'opening_stale_recovery'
    from public.image_generation_candidates c
    join stale s on s.id = c.request_id
    where c.status = 'review'
    on conflict (bucket, storage_path) do update
    set status = 'pending', claimed_at = null, completed_at = null,
        next_attempt_at = now(), last_error = null,
        updated_at = now()
    returning request_id, storage_path
  ), cleaned as (
    delete from public.image_generation_candidates c
    using stale s
    where c.request_id = s.id and c.status = 'review'
    returning c.request_id
  ), updated as (
    update public.image_generation_requests r
    set status = case when s.attempt_count < 3 then 'queued' else 'failed' end,
        claimed_at = case when s.attempt_count < 3 then null else r.claimed_at end,
        next_attempt_at = case when s.attempt_count < 3 then now() else r.next_attempt_at end,
        completed_at = case when s.attempt_count < 3 then null else now() end,
        failure_code = 'worker_stale_timeout',
        failure_detail = 'Worker did not finalize the request before the recovery timeout.',
        updated_at = now()
    from stale s
    where r.id = s.id
    returning r.id, r.status, s.attempt_count
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'request_id', u.id,
    'status', u.status,
    'attempt_count', u.attempt_count,
    'storage_paths', coalesce(
      (select jsonb_agg(e.storage_path) from enqueued e where e.request_id = u.id),
      '[]'::jsonb
    )
  )), '[]'::jsonb)
  into v_recovered
  from updated u;

  return v_recovered;
end;
$$;

create or replace function public.recover_stale_image_generation_refinements(
  p_stale_after_seconds integer default 360,
  p_limit integer default 10
)
returns setof jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_refinement public.image_generation_refinements%rowtype;
  v_paths text[];
  v_status text;
begin
  for v_refinement in
    select * from public.image_generation_refinements
    where status = 'running'
      and claimed_at < now() - make_interval(secs => greatest(60, p_stale_after_seconds))
    order by claimed_at, id
    for update skip locked
    limit greatest(1, least(p_limit, 50))
  loop
    select coalesce(array_agg(storage_path order by ordinal), '{}'::text[])
      into v_paths
    from public.image_generation_candidates
    where refinement_id = v_refinement.id;

    insert into public.image_generation_storage_cleanup_jobs (
      bucket, storage_path, request_id, refinement_id, reason
    )
    select 'image-generation-candidates', c.storage_path, c.request_id,
           c.refinement_id, 'refinement_stale_recovery'
    from public.image_generation_candidates c
    where c.refinement_id = v_refinement.id
    on conflict (bucket, storage_path) do update
    set status = 'pending', claimed_at = null, completed_at = null,
        next_attempt_at = now(), last_error = null,
        updated_at = now();

    delete from public.image_generation_candidates where refinement_id = v_refinement.id;

    v_status := case when v_refinement.attempt_count < 3 then 'queued' else 'failed' end;
    update public.image_generation_refinements
    set status = v_status,
        next_attempt_at = case when v_status = 'queued' then now() else next_attempt_at end,
        claimed_at = null,
        completed_at = case when v_status = 'failed' then now() else null end,
        failure_code = 'worker_interrupted',
        failure_detail = 'Worker claim exceeded the stale execution window.',
        updated_at = now()
    where id = v_refinement.id;

    return next jsonb_build_object(
      'refinement_id', v_refinement.id,
      'status', v_status,
      'storage_paths', to_jsonb(v_paths)
    );
  end loop;
end;
$$;

create or replace function public.claim_next_image_generation_request()
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
  where r.status = 'queued'
    and r.next_attempt_at <= now()
    and r.attempt_count < 3
    and not exists (
      select 1 from public.image_generation_storage_cleanup_jobs j
      where j.request_id = r.id and j.status in ('pending', 'running')
    )
  order by r.next_attempt_at, r.created_at, r.id
  for update of r skip locked
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
    and not exists (
      select 1 from public.image_generation_storage_cleanup_jobs j
      where j.refinement_id = f.id and j.status in ('pending', 'running')
    )
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

revoke all on function public.claim_image_generation_storage_cleanup_jobs(integer, integer)
  from public, anon, authenticated;
revoke all on function public.finalize_image_generation_storage_cleanup_job(bigint, boolean, text)
  from public, anon, authenticated;
grant execute on function public.claim_image_generation_storage_cleanup_jobs(integer, integer)
  to service_role;
grant execute on function public.finalize_image_generation_storage_cleanup_job(bigint, boolean, text)
  to service_role;

commit;
