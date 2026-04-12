-- Trusted auto-enqueue: when a game becomes finished, enqueue exactly one analysis job (idempotent).
-- Uses ONLY public.get_finished_game_analysis_intake inside enqueue (existing law).
--
-- If `finished_game_analysis_jobs` already has duplicate game_id rows, dedupe before applying
-- (unique index creation will fail otherwise).

-- One queue row per game: prevents duplicate queued rows from trigger + manual/API enqueue races.
create unique index if not exists finished_game_analysis_jobs_game_id_uq
  on public.finished_game_analysis_jobs (game_id);

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
  v_status text;
  v_partition text;
  v_schema text;
  v_move_count int;
  v_corr text := nullif(trim(coalesce(p_correlation_id, '')), '');
begin
  if p_game_id is null then
    raise exception 'p_game_id required';
  end if;

  select j.id, j.status
    into v_id, v_status
  from public.finished_game_analysis_jobs j
  where j.game_id = p_game_id
  limit 1;

  -- Idempotent: one terminal/active success path per game (no duplicate queued rows).
  if v_id is not null and v_status in ('queued', 'running', 'completed') then
    return v_id;
  end if;

  v_intake := public.get_finished_game_analysis_intake(p_game_id);

  if v_intake is null then
    if v_id is null then
      begin
        insert into public.finished_game_analysis_jobs (
          game_id,
          status,
          correlation_id
        )
        values (p_game_id, 'no_finished_intake', v_corr)
        returning id into v_id;
      exception
        when unique_violation then
          select j.id, j.status into v_id, v_status
          from public.finished_game_analysis_jobs j
          where j.game_id = p_game_id
          limit 1;
      end;
    end if;
    return v_id;
  end if;

  v_partition := v_intake #>> '{game,analysis_partition}';
  v_schema := v_intake ->> 'schema_version';
  v_move_count := coalesce(jsonb_array_length(v_intake -> 'move_logs'), 0);

  if v_id is not null and v_status in ('no_finished_intake', 'failed') then
    update public.finished_game_analysis_jobs j
    set
      status = 'queued',
      correlation_id = coalesce(v_corr, j.correlation_id),
      intake_schema_version = v_schema,
      analysis_partition = v_partition,
      move_count = v_move_count,
      error_message = null,
      result_meta = '{}'::jsonb,
      updated_at = now()
    where j.id = v_id;
    return v_id;
  end if;

  begin
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
      v_corr,
      v_schema,
      v_partition,
      v_move_count
    )
    returning id into v_id;
  exception
    when unique_violation then
      select j.id, j.status into v_id, v_status
      from public.finished_game_analysis_jobs j
      where j.game_id = p_game_id
      limit 1;
      if v_id is not null and v_status in ('no_finished_intake', 'failed') then
        update public.finished_game_analysis_jobs j
        set
          status = 'queued',
          correlation_id = coalesce(v_corr, j.correlation_id),
          intake_schema_version = v_schema,
          analysis_partition = v_partition,
          move_count = v_move_count,
          error_message = null,
          result_meta = '{}'::jsonb,
          updated_at = now()
        where j.id = v_id;
      end if;
  end;

  return v_id;
end;
$$;

comment on function public.enqueue_finished_game_analysis_job(uuid, text) is
  'Trusted enqueue: calls get_finished_game_analysis_intake only. service_role only. Idempotent per game_id.';

revoke all on function public.enqueue_finished_game_analysis_job(uuid, text) from public;
grant execute on function public.enqueue_finished_game_analysis_job(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- After finish: enqueue analysis job (never blocks game persistence).
-- ---------------------------------------------------------------------------
create or replace function public.trg_games_enqueue_finished_game_analysis()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from 'finished' then
    return new;
  end if;

  -- Re-entrancy / updates while already finished: enqueue once per finish transition.
  if tg_op = 'UPDATE' and old.status = 'finished' then
    return new;
  end if;

  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.status is distinct from 'finished') then
    begin
      perform public.enqueue_finished_game_analysis_job(new.id, 'auto:game_finished');
    exception
      when others then
        raise warning 'enqueue_finished_game_analysis_job failed for game %: %', new.id, sqlerrm;
    end;
  end if;

  return new;
end;
$$;

comment on function public.trg_games_enqueue_finished_game_analysis() is
  'After games row becomes finished: enqueue one analysis job via intake-only RPC (idempotent). Failures are logged, never rolled back with the game row.';

drop trigger if exists games_enqueue_finished_game_analysis_after_finish on public.games;

create trigger games_enqueue_finished_game_analysis_after_finish
  after insert or update of status on public.games
  for each row
  execute function public.trg_games_enqueue_finished_game_analysis();

-- ---------------------------------------------------------------------------
-- Read-model: queue + artifact visibility for one game (debug / product hooks).
-- ---------------------------------------------------------------------------
create or replace function public.get_finished_game_analysis_job_summary(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job jsonb;
  v_artifact_count int;
  v_role text;
begin
  if p_game_id is null then
    return null;
  end if;

  v_role := coalesce(auth.jwt() ->> 'role', '');

  if v_role = 'service_role' then
    null;
  elsif auth.uid() is not null
    and exists (
      select 1
      from public.games g
      where g.id = p_game_id
        and (
          g.white_player_id = auth.uid()
          or g.black_player_id = auth.uid()
        )
    ) then
    null;
  else
    return jsonb_build_object('error', 'forbidden');
  end if;

  select jsonb_build_object(
    'id', j.id,
    'game_id', j.game_id,
    'status', j.status,
    'correlation_id', j.correlation_id,
    'created_at', j.created_at,
    'updated_at', j.updated_at,
    'intake_schema_version', j.intake_schema_version,
    'analysis_partition', j.analysis_partition,
    'move_count', j.move_count,
    'error_message', j.error_message
  )
  into v_job
  from public.finished_game_analysis_jobs j
  where j.game_id = p_game_id
  limit 1;

  select count(*)::int
    into v_artifact_count
  from public.finished_game_analysis_artifacts a
  where a.game_id = p_game_id;

  return jsonb_strip_nulls(
    jsonb_build_object(
      'game_id', p_game_id,
      'never_queued', v_job is null,
      'job', v_job,
      'artifact_count', v_artifact_count,
      'has_artifact', v_artifact_count > 0
    )
  );
end;
$$;

comment on function public.get_finished_game_analysis_job_summary(uuid) is
  'Per-game analysis queue summary: job row + artifact count. Callers: service_role or game participants.';

revoke all on function public.get_finished_game_analysis_job_summary(uuid) from public;
grant execute on function public.get_finished_game_analysis_job_summary(uuid) to authenticated, service_role;
