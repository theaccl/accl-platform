-- Persisted artifact foundation for finished-game analysis outputs.
-- Artifacts are linked to queue jobs + game id and written by trusted processors.

create table if not exists public.finished_game_analysis_artifacts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.finished_game_analysis_jobs(id) on delete cascade,
  game_id uuid not null,
  artifact_type text not null,
  artifact_version text not null,
  analysis_partition text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finished_game_analysis_artifacts_type_check check (artifact_type in ('placeholder'))
);

create unique index if not exists finished_game_analysis_artifacts_job_type_uq
  on public.finished_game_analysis_artifacts(job_id, artifact_type);

create index if not exists finished_game_analysis_artifacts_game_created_idx
  on public.finished_game_analysis_artifacts(game_id, created_at desc);

comment on table public.finished_game_analysis_artifacts is
  'Persisted analysis artifacts linked to finished_game_analysis_jobs and game_id.';

alter table public.finished_game_analysis_artifacts enable row level security;

revoke all on public.finished_game_analysis_artifacts from public;
grant select, insert, update on public.finished_game_analysis_artifacts to service_role;

create or replace function public.upsert_finished_game_analysis_artifact(
  p_job_id uuid,
  p_game_id uuid,
  p_artifact_type text,
  p_artifact_version text,
  p_analysis_partition text,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_job_id is null or p_game_id is null then
    raise exception 'p_job_id and p_game_id required';
  end if;
  if p_artifact_type is null or trim(p_artifact_type) = '' then
    raise exception 'p_artifact_type required';
  end if;
  if p_artifact_version is null or trim(p_artifact_version) = '' then
    raise exception 'p_artifact_version required';
  end if;

  insert into public.finished_game_analysis_artifacts (
    job_id,
    game_id,
    artifact_type,
    artifact_version,
    analysis_partition,
    payload
  )
  values (
    p_job_id,
    p_game_id,
    trim(p_artifact_type),
    trim(p_artifact_version),
    nullif(trim(coalesce(p_analysis_partition, '')), ''),
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (job_id, artifact_type)
  do update set
    artifact_version = excluded.artifact_version,
    analysis_partition = excluded.analysis_partition,
    payload = excluded.payload,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.upsert_finished_game_analysis_artifact(uuid, uuid, text, text, text, jsonb) is
  'Writes/updates persisted artifact for a finished-game analysis job.';

revoke all on function public.upsert_finished_game_analysis_artifact(uuid, uuid, text, text, text, jsonb) from public;
grant execute on function public.upsert_finished_game_analysis_artifact(uuid, uuid, text, text, text, jsonb) to service_role;

create or replace function public.get_latest_finished_game_analysis_artifacts(
  p_game_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_game_id is null then
    return '[]'::jsonb;
  end if;

  -- Hard boundary by intake gate: only expose artifacts when canonical finished intake exists.
  if public.get_finished_game_analysis_intake(p_game_id) is null then
    return '[]'::jsonb;
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'job_id', a.job_id,
          'game_id', a.game_id,
          'artifact_type', a.artifact_type,
          'artifact_version', a.artifact_version,
          'analysis_partition', a.analysis_partition,
          'payload', a.payload,
          'created_at', a.created_at,
          'updated_at', a.updated_at
        )
        order by a.created_at desc
      )
      from public.finished_game_analysis_artifacts a
      where a.game_id = p_game_id
    ),
    '[]'::jsonb
  );
end;
$$;

comment on function public.get_latest_finished_game_analysis_artifacts(uuid) is
  'Read-model for latest finished-game artifacts; returns [] when game is not in finished intake.';

revoke all on function public.get_latest_finished_game_analysis_artifacts(uuid) from public;
grant execute on function public.get_latest_finished_game_analysis_artifacts(uuid) to authenticated, service_role;

