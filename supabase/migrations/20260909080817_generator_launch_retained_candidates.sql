begin;
-- Existing commissions retain the original keep-one contract.
alter table public.image_generation_requests add column keep_limit smallint not null default 1 check(keep_limit between 1 and 2);
alter table public.image_generation_requests add column policy_version text not null default 'legacy.keep-one';
create function public.snapshot_generator_launch_contract() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 new.keep_limit:=case when new.membership_tier in ('plus','pro','internal_unlimited') then 2 else 1 end;
 new.policy_version:='launch.2026-09-09';
 return new;
end; $$;
revoke all on function public.snapshot_generator_launch_contract() from public,anon,authenticated;
create trigger snapshot_generator_launch_contract before insert on public.image_generation_requests
 for each row execute function public.snapshot_generator_launch_contract();
alter table public.image_saved_creations drop constraint image_saved_creations_generation_request_id_key;
create index image_saved_creations_request_idx on public.image_saved_creations(generation_request_id);

create function public.approve_image_generation_candidates(p_owner_id uuid,p_request_id uuid,p_candidate_ids uuid[])
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_request public.image_generation_requests%rowtype; v_selected uuid[]; v_existing uuid[]; v_count integer;
begin
 if p_candidate_ids is null or cardinality(p_candidate_ids) not between 1 and 2 or array_position(p_candidate_ids,null) is not null then
  raise exception 'invalid retained candidate selection'; end if;
 select array_agg(distinct id order by id) into v_selected from unnest(p_candidate_ids) id;
 if cardinality(v_selected)<>cardinality(p_candidate_ids) then raise exception 'duplicate candidate selection'; end if;
 select * into v_request from public.image_generation_requests where id=p_request_id and owner_id=p_owner_id for update;
 if not found then raise exception 'request not found'; end if;
 if v_request.status='approved' then
  select array_agg(id order by id) into v_existing from public.image_generation_candidates
   where request_id=p_request_id and owner_id=p_owner_id and status='approved';
  if v_existing is distinct from v_selected then raise exception 'accepted selection is final'; end if;
 else
  if v_request.status<>'review' then raise exception 'request is not awaiting review'; end if;
  if cardinality(v_selected)>v_request.keep_limit then raise exception 'membership keep limit exceeded'; end if;
  if v_request.review_expires_at is null or v_request.review_expires_at<=now() then
   return jsonb_build_object('error','review_window_expired'); end if;
  if exists(select 1 from public.image_generation_refinements where request_id=p_request_id and status in ('queued','running')) then
   raise exception 'guided refinement is still processing'; end if;
  perform 1 from public.image_generation_candidates where request_id=p_request_id for update;
  select count(*) into v_count from public.image_generation_candidates where id=any(v_selected)
   and request_id=p_request_id and owner_id=p_owner_id and status='review' and moderation_status='approved';
  if v_count<>cardinality(v_selected) then raise exception 'candidate is not approvable'; end if;
  update public.image_generation_candidates set status=case when id=any(v_selected) then 'approved' else 'rejected' end,
   approved_at=case when id=any(v_selected) then now() else approved_at end,updated_at=now()
   where request_id=p_request_id and status='review';
  update public.image_generation_requests set status='approved',updated_at=now() where id=p_request_id;
  insert into public.image_generation_approval_events(request_id,candidate_id,owner_id,event_type)
   select p_request_id,id,p_owner_id,'approved' from unnest(v_selected) id;
 end if;
 return jsonb_build_object('candidates',(select jsonb_agg(to_jsonb(c) order by ordinal) from public.image_generation_candidates c where id=any(v_selected)));
end; $$;
revoke all on function public.approve_image_generation_candidates(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.approve_image_generation_candidates(uuid,uuid,uuid[]) to service_role;

-- Old clients may still accept one; both signatures share finalization/replay.
create or replace function public.approve_image_generation_candidate(p_owner_id uuid,p_request_id uuid,p_candidate_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_result jsonb;
begin
 v_result:=public.approve_image_generation_candidates(p_owner_id,p_request_id,array[p_candidate_id]);
 if v_result ? 'error' then return v_result; end if;
 return v_result->'candidates'->0;
end; $$;
revoke all on function public.approve_image_generation_candidate(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.approve_image_generation_candidate(uuid,uuid,uuid) to service_role;
commit;
