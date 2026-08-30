-- Image Generator Step 6: store only purpose-built still derivatives on public profile surfaces.

begin;

alter table public.profile_imagery_assignments
  add column derivative_format text not null default 'webp'
    check (derivative_format = 'webp'),
  add column derivative_width integer not null default 512
    check (derivative_width between 1 and 4096),
  add column derivative_height integer not null default 512
    check (derivative_height between 1 and 4096),
  add column derivative_byte_size bigint not null default 1
    check (derivative_byte_size between 1 and 8388608),
  add column derivative_version text not null default 'placement.v1'
    check (char_length(derivative_version) between 1 and 50);

drop function public.place_approved_profile_image(uuid, uuid, text, text);

create function public.place_approved_profile_image(
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
    raise exception 'invalid still derivative format or version';
  end if;
  if p_surface = 'profile_image' and
    (p_derivative_width <> 512 or p_derivative_height <> 512 or p_derivative_byte_size > 5242880) then
    raise exception 'invalid profile image derivative';
  end if;
  if p_surface = 'profile_background' and
    (p_derivative_width <> 1600 or p_derivative_height <> 900 or p_derivative_byte_size > 8388608) then
    raise exception 'invalid profile background derivative';
  end if;

  select c.* into v_candidate
  from public.image_generation_candidates c
  join public.image_generation_requests r on r.id = c.request_id
  where c.id = p_candidate_id and c.owner_id = p_owner_id
    and c.status = 'approved' and c.moderation_status = 'approved' and r.status = 'approved'
  for update of c;
  if not found then raise exception 'approved moderated candidate not found'; end if;

  insert into public.profile_imagery_assignments (
    user_id, surface, candidate_id, published_storage_path,
    still_only_in_community, motion_enabled_on_profile, motion_preset,
    derivative_format, derivative_width, derivative_height, derivative_byte_size, derivative_version
  ) values (
    p_owner_id, p_surface, p_candidate_id, p_published_storage_path,
    true, false, null,
    p_derivative_format, p_derivative_width, p_derivative_height, p_derivative_byte_size,
    p_derivative_version
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
  if not found then raise exception 'profile row not found'; end if;

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
      'derivative_version', p_derivative_version
    )
  );
  return jsonb_build_object(
    'candidate_id', p_candidate_id,
    'surface', p_surface,
    'published_storage_path', p_published_storage_path,
    'derivative_format', p_derivative_format,
    'derivative_width', p_derivative_width,
    'derivative_height', p_derivative_height,
    'derivative_byte_size', p_derivative_byte_size,
    'derivative_version', p_derivative_version,
    'motion_enabled_on_profile', false,
    'still_only_in_community', true
  );
end;
$$;

revoke all on function public.place_approved_profile_image(uuid, uuid, text, text, text, integer, integer, bigint, text) from public;
grant execute on function public.place_approved_profile_image(uuid, uuid, text, text, text, integer, integer, bigint, text) to service_role;

commit;
