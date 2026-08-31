-- Enforce tier-specific reference and placement contracts.

begin;

alter table public.image_generation_references
  add column request_id uuid
    references public.image_generation_requests(id) on delete restrict;

update public.image_generation_references ref
set request_id = req.id, updated_at = now()
from public.image_generation_requests req
where req.reference_id = ref.id and ref.request_id is null;

comment on column public.image_generation_references.request_id is
  'Single commission that consumed this private reference. Prevents reuse across commissions.';

alter table public.image_generation_requests
  add column reference_id_2 uuid
    references public.image_generation_references(id) on delete restrict,
  add constraint image_generation_requests_distinct_references_check check (
    reference_id_2 is null or reference_id is distinct from reference_id_2
  );

create unique index image_generation_requests_reference_two_once_idx
  on public.image_generation_requests (reference_id_2)
  where reference_id_2 is not null;

create or replace function public.create_image_generation_request_with_references(
  p_owner_id uuid,
  p_prompt text,
  p_candidate_count smallint,
  p_idempotency_key text,
  p_reference_ids uuid[] default '{}'::uuid[],
  p_provider text default 'unconfigured',
  p_model text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_max_references integer;
  v_reference_count integer;
  v_reference_id uuid;
  v_reference_1 uuid;
  v_reference_2 uuid;
  v_request jsonb;
  v_request_id uuid;
  v_existing public.image_generation_requests%rowtype;
  v_reference public.image_generation_references%rowtype;
begin
  if p_reference_ids is null then p_reference_ids := '{}'::uuid[]; end if;
  if array_position(p_reference_ids, null) is not null then
    raise exception 'reference ids cannot contain null';
  end if;
  v_reference_count := cardinality(p_reference_ids);
  if v_reference_count <> cardinality(array(select distinct unnest(p_reference_ids))) then
    raise exception 'reference ids must be distinct';
  end if;

  v_tier := public.effective_image_generator_tier(p_owner_id);
  v_max_references := case when v_tier in ('pro', 'internal_unlimited') then 2 else 1 end;
  if v_reference_count > v_max_references then
    raise exception 'reference count exceeds effective membership tier';
  end if;

  v_reference_1 := p_reference_ids[1];
  v_reference_2 := p_reference_ids[2];

  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 716));

  foreach v_reference_id in array p_reference_ids loop
    select * into v_reference
    from public.image_generation_references r
    where r.id = v_reference_id and r.owner_id = p_owner_id
    for update;
    if not found or v_reference.status <> 'ready' or v_reference.expires_at <= now() then
      raise exception 'reference image is unavailable';
    end if;
  end loop;

  select * into v_existing
  from public.image_generation_requests r
  where r.owner_id = p_owner_id and r.idempotency_key = trim(p_idempotency_key)
  for update;

  if found and (
    v_existing.reference_id is distinct from v_reference_1
    or v_existing.reference_id_2 is distinct from v_reference_2
  ) then
    raise exception 'idempotency key reused with different references';
  end if;

  v_request := public.create_image_generation_request(
    p_owner_id,
    p_prompt,
    p_candidate_count,
    p_idempotency_key,
    v_reference_1,
    p_provider,
    p_model
  );
  v_request_id := (v_request ->> 'id')::uuid;

  update public.image_generation_requests
  set reference_id_2 = v_reference_2, updated_at = now()
  where id = v_request_id
    and (reference_id_2 is null or reference_id_2 = v_reference_2);
  if not found then raise exception 'idempotency key reused with different references'; end if;

  foreach v_reference_id in array p_reference_ids loop
    update public.image_generation_references
    set request_id = v_request_id, updated_at = now()
    where id = v_reference_id
      and (request_id is null or request_id = v_request_id);
    if not found then raise exception 'reference image was already used'; end if;
  end loop;

  return (
    select to_jsonb(r) - 'failure_detail'
    from public.image_generation_requests r
    where r.id = v_request_id
  );
end;
$$;

revoke all on function public.create_image_generation_request_with_references(
  uuid, text, smallint, text, uuid[], text, text
) from public, anon, authenticated;
grant execute on function public.create_image_generation_request_with_references(
  uuid, text, smallint, text, uuid[], text, text
) to service_role;

create or replace function public.enforce_image_generation_placement_contract(
  p_owner_id uuid,
  p_candidate_id uuid,
  p_surface text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.image_generation_requests%rowtype;
  v_candidate public.image_generation_candidates%rowtype;
begin
  select c.* into v_candidate
  from public.image_generation_candidates c
  join public.image_generation_requests r on r.id = c.request_id
  where c.id = p_candidate_id and c.owner_id = p_owner_id
  for update of c, r;

  if not found then raise exception 'approved candidate not found'; end if;
  select * into v_request
  from public.image_generation_requests
  where id = v_candidate.request_id;
  if v_request.membership_tier in ('pro', 'internal_unlimited') then return; end if;

  if exists (
    select 1 from public.image_generation_approval_events e
    where e.request_id = v_request.id
      and e.owner_id = p_owner_id
      and e.event_type = 'placed'
      and e.surface is distinct from p_surface
  ) then
    raise exception 'this commission permits either icon or background placement, not both';
  end if;
end;
$$;

revoke all on function public.enforce_image_generation_placement_contract(uuid, uuid, text)
  from public, anon, authenticated;

-- The derivative-aware placement function is the current runtime signature.
create or replace function public.place_approved_profile_image(
  p_owner_id uuid,
  p_candidate_id uuid,
  p_surface text,
  p_published_storage_path text,
  p_derivative_format text,
  p_derivative_width integer,
  p_derivative_height integer,
  p_derivative_byte_size bigint,
  p_derivative_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate public.image_generation_candidates%rowtype;
begin
  if p_surface not in ('profile_image', 'profile_background') then
    raise exception 'invalid profile imagery surface';
  end if;
  if left(p_published_storage_path, 37) <> (p_owner_id::text || '/') then
    raise exception 'published path must be owner-namespaced';
  end if;
  if p_derivative_format <> 'webp' or p_derivative_version <> 'placement.v1' then
    raise exception 'unsupported profile derivative';
  end if;
  if (p_surface = 'profile_image' and (p_derivative_width <> 512 or p_derivative_height <> 512))
    or (p_surface = 'profile_background' and (p_derivative_width <> 1600 or p_derivative_height <> 900)) then
    raise exception 'invalid derivative dimensions';
  end if;
  if p_derivative_byte_size is null or p_derivative_byte_size not between 1 and 20971520 then
    raise exception 'invalid derivative byte size';
  end if;

  select c.* into v_candidate
  from public.image_generation_candidates c
  join public.image_generation_requests r on r.id = c.request_id
  where c.id = p_candidate_id and c.owner_id = p_owner_id
    and c.status = 'approved' and r.status = 'approved'
  for update of c;
  if not found then raise exception 'approved candidate not found'; end if;

  perform public.enforce_image_generation_placement_contract(
    p_owner_id, p_candidate_id, p_surface
  );

  insert into public.profile_imagery_assignments (
    user_id, surface, candidate_id, published_storage_path,
    still_only_in_community, motion_enabled_on_profile, motion_preset,
    derivative_format, derivative_width, derivative_height,
    derivative_byte_size, derivative_version
  ) values (
    p_owner_id, p_surface, p_candidate_id, p_published_storage_path,
    true, false, null, p_derivative_format, p_derivative_width,
    p_derivative_height, p_derivative_byte_size, p_derivative_version
  )
  on conflict (user_id, surface) do update set
    candidate_id = excluded.candidate_id,
    published_storage_path = excluded.published_storage_path,
    still_only_in_community = true,
    motion_enabled_on_profile = false,
    motion_preset = null,
    derivative_format = excluded.derivative_format,
    derivative_width = excluded.derivative_width,
    derivative_height = excluded.derivative_height,
    derivative_byte_size = excluded.derivative_byte_size,
    derivative_version = excluded.derivative_version,
    updated_at = now();

  if p_surface = 'profile_image' then
    update public.profiles set avatar_path = p_published_storage_path where id = p_owner_id;
  else
    update public.profiles set profile_background_path = p_published_storage_path where id = p_owner_id;
  end if;

  insert into public.image_generation_approval_events (
    request_id, candidate_id, owner_id, event_type, surface, metadata
  ) values (
    v_candidate.request_id, p_candidate_id, p_owner_id, 'placed', p_surface,
    jsonb_build_object(
      'published_storage_path', p_published_storage_path,
      'derivative_format', p_derivative_format,
      'derivative_width', p_derivative_width,
      'derivative_height', p_derivative_height,
      'derivative_byte_size', p_derivative_byte_size,
      'derivative_version', p_derivative_version,
      'still_only_in_community', true
    )
  );

  return jsonb_build_object(
    'surface', p_surface,
    'candidate_id', p_candidate_id,
    'published_storage_path', p_published_storage_path,
    'still_only_in_community', true,
    'derivative_format', p_derivative_format,
    'derivative_width', p_derivative_width,
    'derivative_height', p_derivative_height,
    'derivative_byte_size', p_derivative_byte_size,
    'derivative_version', p_derivative_version
  );
end;
$$;

revoke all on function public.place_approved_profile_image(
  uuid, uuid, text, text, text, integer, integer, bigint, text
) from public, anon, authenticated;
grant execute on function public.place_approved_profile_image(
  uuid, uuid, text, text, text, integer, integer, bigint, text
) to service_role;

create or replace function public.place_approved_profile_image_set(
  p_owner_id uuid,
  p_candidate_id uuid,
  p_icon_storage_path text,
  p_icon_byte_size bigint,
  p_background_storage_path text,
  p_background_byte_size bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tier text;
  v_icon jsonb;
  v_background jsonb;
begin
  select r.membership_tier into v_tier
  from public.image_generation_candidates c
  join public.image_generation_requests r on r.id = c.request_id
  where c.id = p_candidate_id
    and c.owner_id = p_owner_id
    and c.status = 'approved'
    and r.status = 'approved'
  for update of c, r;

  if not found then raise exception 'approved candidate not found'; end if;
  if v_tier not in ('pro', 'internal_unlimited') then
    raise exception 'matching icon and background placement requires Pro';
  end if;

  v_icon := public.place_approved_profile_image(
    p_owner_id, p_candidate_id, 'profile_image', p_icon_storage_path,
    'webp', 512, 512, p_icon_byte_size, 'placement.v1'
  );
  v_background := public.place_approved_profile_image(
    p_owner_id, p_candidate_id, 'profile_background', p_background_storage_path,
    'webp', 1600, 900, p_background_byte_size, 'placement.v1'
  );

  return jsonb_build_object('profile_image', v_icon, 'profile_background', v_background);
end;
$$;

revoke all on function public.place_approved_profile_image_set(
  uuid, uuid, text, bigint, text, bigint
) from public, anon, authenticated;
grant execute on function public.place_approved_profile_image_set(
  uuid, uuid, text, bigint, text, bigint
) to service_role;

commit;
