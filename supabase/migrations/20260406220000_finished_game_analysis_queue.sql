-- Server-side finished-game analysis job queue (foundation only).
-- Enqueue path uses ONLY public.get_finished_game_analysis_intake (no direct games / move_logs reads).
-- Non-finished games: intake returns NULL → job row with status `no_finished_intake` (audit), no downstream analysis.

create table if not exists public.finished_game_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null,
  status text not null,
  job_schema_version text not null default 'ajq.1',
  correlation_id text,
  intake_schema_version text,
  analysis_partition text,
  move_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  error_message text,
  result_meta jsonb not null default '{}'::jsonb,
  constraint finished_game_analysis_jobs_status_check check (
    status in (
      'queued',
      'no_finished_intake',
      'running',
      'completed',
      'failed'
    )
  )
);

create index if not exists finished_game_analysis_jobs_created_at_idx
  on public.finished_game_analysis_jobs (created_at desc);

comment on table public.finished_game_analysis_jobs is
  'Queue foundation for finished-game engine/AI jobs. Populated only via enqueue_finished_game_analysis_job (intake-only).';

alter table public.finished_game_analysis_jobs enable row level security;

revoke all on public.finished_game_analysis_jobs from public;
grant select, insert, update on public.finished_game_analysis_jobs to service_role;

create or replace function public.enqueue_finished_game_analysis_job(
  p_game_id uuid,
  p_correlation_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_intake jsonb;
  v_id uuid;
  v_partition text;
  v_schema text;
  v_move_count int;
begin
  if p_game_id is null then
    raise exception 'p_game_id required';
  end if;

  v_intake := public.get_finished_game_analysis_intake(p_game_id);

  if v_intake is null then
    insert into public.finished_game_analysis_jobs (
      game_id,
      status,
      correlation_id
    )
    values (p_game_id, 'no_finished_intake', nullif(trim(coalesce(p_correlation_id, '')), ''))
    returning id into v_id;
    return v_id;
  end if;

  v_partition := v_intake #>> '{game,analysis_partition}';
  v_schema := v_intake ->> 'schema_version';
  v_move_count := coalesce(jsonb_array_length(v_intake -> 'move_logs'), 0);

  insert into public.finished_game_analysis_jobs (
    game_id,
    status,
    correlation_id,
    intake_schema_version,
    analysis_partition,
    move_count
  )
  values (
    p_game_id,
    'queued',
    nullif(trim(coalesce(p_correlation_id, '')), ''),
    v_schema,
    v_partition,
    v_move_count
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.enqueue_finished_game_analysis_job(uuid, text) is
  'Trusted enqueue: calls get_finished_game_analysis_intake only. service_role only.';

revoke all on function public.enqueue_finished_game_analysis_job(uuid, text) from public;
grant execute on function public.enqueue_finished_game_analysis_job(uuid, text) to service_role;
