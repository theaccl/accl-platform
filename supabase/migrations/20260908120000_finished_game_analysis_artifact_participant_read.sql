-- Finished-game analysis artifacts are private to seated participants.
-- The trusted service role retains access for workers and operator APIs.

create or replace function public.get_latest_finished_game_analysis_artifacts(
  p_game_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_service_role boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
begin
  if p_game_id is null then
    return '[]'::jsonb;
  end if;

  if not v_is_service_role and (
    v_uid is null
    or not exists (
      select 1
      from public.games g
      where g.id = p_game_id
        and g.status = 'finished'
        and (g.white_player_id = v_uid or g.black_player_id = v_uid)
    )
  ) then
    return '[]'::jsonb;
  end if;

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
  'Participant-only finished-game artifact read model; trusted service role retained for server processing.';

revoke all on function public.get_latest_finished_game_analysis_artifacts(uuid) from public;
revoke all on function public.get_latest_finished_game_analysis_artifacts(uuid) from anon;
revoke all on function public.get_latest_finished_game_analysis_artifacts(uuid) from authenticated;
revoke all on function public.get_latest_finished_game_analysis_artifacts(uuid) from service_role;
grant execute on function public.get_latest_finished_game_analysis_artifacts(uuid) to authenticated, service_role;
