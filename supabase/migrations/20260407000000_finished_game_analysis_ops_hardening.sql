-- Ops hardening: stale-running recovery + queue health summary.
-- Keeps existing claim/finalize semantics intact.

create or replace function public.fail_stale_running_finished_game_analysis_jobs(
  p_stale_after_seconds integer default 900,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seconds int := greatest(60, coalesce(p_stale_after_seconds, 900));
  v_limit int := greatest(1, least(coalesce(p_limit, 100), 1000));
begin
  return (
    with stale as (
      select j.id
      from public.finished_game_analysis_jobs j
      where j.status = 'running'
        and j.updated_at < (now() - make_interval(secs => v_seconds))
      order by j.updated_at asc
      for update skip locked
      limit v_limit
    ),
    upd as (
      update public.finished_game_analysis_jobs j
      set
        status = 'failed',
        updated_at = now(),
        error_message = format('stale running timeout after %s seconds', v_seconds),
        result_meta = coalesce(j.result_meta, '{}'::jsonb) || jsonb_build_object(
          'ops_recovery', true,
          'ops_recovery_strategy', 'mark_failed',
          'stale_after_seconds', v_seconds,
          'recovered_at', now()
        )
      from stale s
      where j.id = s.id
      returning j.id
    )
    select jsonb_build_object(
      'stale_after_seconds', v_seconds,
      'limit', v_limit,
      'updated_count', (select count(*) from upd),
      'job_ids', coalesce((select jsonb_agg(u.id) from upd u), '[]'::jsonb)
    )
  );
end;
$$;

comment on function public.fail_stale_running_finished_game_analysis_jobs(integer, integer) is
  'Marks stale running analysis jobs as failed (ops recovery). Uses SKIP LOCKED and limit.';

revoke all on function public.fail_stale_running_finished_game_analysis_jobs(integer, integer) from public;
grant execute on function public.fail_stale_running_finished_game_analysis_jobs(integer, integer) to service_role;

create or replace function public.get_finished_game_analysis_queue_ops_summary(
  p_stale_after_seconds integer default 900
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seconds int := greatest(60, coalesce(p_stale_after_seconds, 900));
begin
  return jsonb_build_object(
    'stale_after_seconds', v_seconds,
    'counts', (
      select jsonb_build_object(
        'queued', count(*) filter (where j.status = 'queued'),
        'running', count(*) filter (where j.status = 'running'),
        'completed', count(*) filter (where j.status = 'completed'),
        'failed', count(*) filter (where j.status = 'failed'),
        'no_finished_intake', count(*) filter (where j.status = 'no_finished_intake')
      )
      from public.finished_game_analysis_jobs j
    ),
    'stale_running_count', (
      select count(*)::int
      from public.finished_game_analysis_jobs j
      where j.status = 'running'
        and j.updated_at < (now() - make_interval(secs => v_seconds))
    ),
    'oldest_running_updated_at', (
      select min(j.updated_at)
      from public.finished_game_analysis_jobs j
      where j.status = 'running'
    ),
    'newest_failure_at', (
      select max(j.updated_at)
      from public.finished_game_analysis_jobs j
      where j.status = 'failed'
    )
  );
end;
$$;

comment on function public.get_finished_game_analysis_queue_ops_summary(integer) is
  'Queue health summary with stale-running signal and status counts.';

revoke all on function public.get_finished_game_analysis_queue_ops_summary(integer) from public;
grant execute on function public.get_finished_game_analysis_queue_ops_summary(integer) to service_role;

