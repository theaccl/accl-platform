-- Trusted processor primitives: safe claim (SKIP LOCKED) + finalize from `running` only.
-- Processor runtime must re-fetch payload only via get_finished_game_analysis_intake (outside this file).

create or replace function public.claim_next_finished_game_analysis_job()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select q.id
    into v_id
  from public.finished_game_analysis_jobs q
  where q.status = 'queued'
  order by q.created_at asc
  for update skip locked
  limit 1;

  if v_id is null then
    return null;
  end if;

  update public.finished_game_analysis_jobs j
  set
    status = 'running',
    updated_at = now()
  where j.id = v_id;

  return (
    select to_jsonb(j)
    from public.finished_game_analysis_jobs j
    where j.id = v_id
  );
end;
$$;

comment on function public.claim_next_finished_game_analysis_job() is
  'Atomically claims one queued job as running (SKIP LOCKED). service_role only. Returns row jsonb or null.';

revoke all on function public.claim_next_finished_game_analysis_job() from public;
grant execute on function public.claim_next_finished_game_analysis_job() to service_role;

create or replace function public.finalize_finished_game_analysis_job(
  p_job_id uuid,
  p_final_status text,
  p_result_meta jsonb default '{}'::jsonb,
  p_error_message text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_job_id is null then
    raise exception 'p_job_id required';
  end if;

  if p_final_status is null
    or p_final_status not in ('completed', 'failed', 'no_finished_intake') then
    raise exception 'p_final_status must be completed, failed, or no_finished_intake';
  end if;

  update public.finished_game_analysis_jobs
  set
    status = p_final_status,
    updated_at = now(),
    result_meta = coalesce(p_result_meta, '{}'::jsonb),
    error_message = p_error_message
  where id = p_job_id
    and status = 'running';

  return found;
end;
$$;

comment on function public.finalize_finished_game_analysis_job(uuid, text, jsonb, text) is
  'Moves a running job to completed/failed/no_finished_intake. No-op if not running. service_role only.';

revoke all on function public.finalize_finished_game_analysis_job(uuid, text, jsonb, text) from public;
grant execute on function public.finalize_finished_game_analysis_job(uuid, text, jsonb, text) to service_role;
