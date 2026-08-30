-- Image Generator Step 5: keep candidates pending until provider and integrity checks pass.

begin;

alter table public.image_generation_candidates
  alter column moderation_status set default 'pending';

drop function public.register_image_generation_candidate(uuid, smallint, text, text, bigint, integer, integer, text);

create function public.register_image_generation_candidate(
  p_request_id uuid,
  p_ordinal smallint,
  p_storage_path text,
  p_mime_type text,
  p_byte_size bigint,
  p_width integer default null,
  p_height integer default null,
  p_sha256 text default null,
  p_moderation_status text default 'pending'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.image_generation_requests%rowtype;
  v_candidate public.image_generation_candidates%rowtype;
begin
  select * into v_request from public.image_generation_requests
  where id = p_request_id for update;
  if not found or v_request.status <> 'running' then
    raise exception 'request must be running';
  end if;
  if p_ordinal not between 1 and v_request.candidate_count then
    raise exception 'candidate ordinal outside requested range';
  end if;
  if left(p_storage_path, 37) <> (v_request.owner_id::text || '/') then
    raise exception 'candidate storage path must be owner-namespaced';
  end if;
  if p_moderation_status <> 'approved' then
    raise exception 'candidate must pass moderation before registration';
  end if;

  insert into public.image_generation_candidates (
    request_id, owner_id, ordinal, storage_path, mime_type, byte_size, width, height, sha256,
    moderation_status
  ) values (
    p_request_id, v_request.owner_id, p_ordinal, p_storage_path, p_mime_type,
    p_byte_size, p_width, p_height, nullif(trim(p_sha256), ''), p_moderation_status
  )
  returning * into v_candidate;
  return to_jsonb(v_candidate);
end;
$$;

create or replace function public.finalize_image_generation_request(
  p_request_id uuid,
  p_succeeded boolean,
  p_failure_code text default null,
  p_failure_detail text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate_count integer;
begin
  if p_succeeded then
    select count(*)::int into v_candidate_count
    from public.image_generation_candidates c
    where c.request_id = p_request_id
      and c.status = 'review'
      and c.moderation_status = 'approved';
    if v_candidate_count < 1 then
      raise exception 'successful request requires a moderated candidate';
    end if;
  end if;

  update public.image_generation_requests
  set status = case when p_succeeded then 'review' else 'failed' end,
      review_expires_at = case when p_succeeded then now() + interval '24 hours' else null end,
      completed_at = now(), updated_at = now(),
      failure_code = case when p_succeeded then null else nullif(trim(p_failure_code), '') end,
      failure_detail = case when p_succeeded then null else left(p_failure_detail, 2000) end
  where id = p_request_id and status = 'running';
  if found and not p_succeeded then
    update public.image_generation_candidates
    set status = 'deleted', updated_at = now()
    where request_id = p_request_id and status = 'review';
  end if;
  return found;
end;
$$;

revoke all on function public.register_image_generation_candidate(uuid, smallint, text, text, bigint, integer, integer, text, text) from public;
grant execute on function public.register_image_generation_candidate(uuid, smallint, text, text, bigint, integer, integer, text, text) to service_role;

commit;
