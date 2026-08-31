-- Recover refinement work interrupted after claim. Partial candidate objects are
-- returned to the server for exact cleanup before the same job is retried.

begin;

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

revoke all on function public.recover_stale_image_generation_refinements(integer, integer)
  from public, anon, authenticated;
grant execute on function public.recover_stale_image_generation_refinements(integer, integer)
  to service_role;

commit;
