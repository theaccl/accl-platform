-- Image Generator Step 4: bounded transient retries and stale-worker recovery.

begin;

alter table public.image_generation_requests
  add column next_attempt_at timestamptz not null default now();

drop index if exists public.image_generation_requests_queue_idx;
create index image_generation_requests_queue_idx
  on public.image_generation_requests (next_attempt_at, created_at, id)
  where status = 'queued';

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
  order by r.next_attempt_at, r.created_at, r.id
  for update skip locked
  limit 1;

  if v_id is null then return null; end if;

  update public.image_generation_requests
  set status = 'running', claimed_at = now(), attempt_count = attempt_count + 1, updated_at = now()
  where id = v_id;

  return (
    select to_jsonb(r) - 'failure_detail'
    from public.image_generation_requests r where r.id = v_id
  );
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

  return jsonb_build_object(
    'request_id', p_request_id,
    'status', case when v_retry then 'queued' else 'failed' end,
    'attempt_count', v_request.attempt_count
  );
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
  ), cleaned as (
    delete from public.image_generation_candidates c
    using stale s
    where c.request_id = s.id and c.status = 'review'
    returning c.request_id, c.storage_path
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
      (select jsonb_agg(c.storage_path) from cleaned c where c.request_id = u.id),
      '[]'::jsonb
    )
  )), '[]'::jsonb)
  into v_recovered
  from updated u;

  return v_recovered;
end;
$$;

revoke all on function public.retry_or_fail_image_generation_request(uuid, boolean, text, text, integer) from public;
revoke all on function public.recover_stale_image_generation_requests(integer, integer) from public;
grant execute on function public.retry_or_fail_image_generation_request(uuid, boolean, text, text, integer) to service_role;
grant execute on function public.recover_stale_image_generation_requests(integer, integer) to service_role;

commit;
