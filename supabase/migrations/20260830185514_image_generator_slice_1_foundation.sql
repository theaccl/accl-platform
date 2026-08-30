-- Image Generator Slice 1 foundation.
-- Private candidates, durable processing, atomic approval, public still placement,
-- membership entitlements, and service-role-only mutation boundaries.

begin;

create table public.membership_entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement text not null,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'expired', 'revoked')),
  source text not null default 'manual',
  valid_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, entitlement),
  constraint membership_entitlements_name_check check (
    entitlement in ('image_generator', 'profile_motion')
  )
);

comment on table public.membership_entitlements is
  'Server-managed product entitlements. Authorization must not depend on user_metadata.';

create table public.image_generation_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'review', 'approved', 'failed', 'cancelled', 'expired')),
  prompt text not null,
  prompt_version text not null default 'slice1.v1',
  provider text not null default 'unconfigured',
  model text,
  candidate_count smallint not null default 4
    check (candidate_count between 1 and 4),
  idempotency_key text not null,
  attempt_count smallint not null default 0 check (attempt_count >= 0),
  claimed_at timestamptz,
  review_expires_at timestamptz,
  completed_at timestamptz,
  failure_code text,
  failure_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, idempotency_key),
  constraint image_generation_prompt_length_check check (
    char_length(trim(prompt)) between 1 and 2000
  ),
  constraint image_generation_idempotency_length_check check (
    char_length(idempotency_key) between 8 and 200
  )
);

create index image_generation_requests_queue_idx
  on public.image_generation_requests (created_at, id)
  where status = 'queued';
create index image_generation_requests_owner_idx
  on public.image_generation_requests (owner_id, created_at desc);

create table public.image_generation_candidates (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.image_generation_requests(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  ordinal smallint not null check (ordinal between 1 and 4),
  status text not null default 'review'
    check (status in ('review', 'approved', 'rejected', 'expired', 'deleted')),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  byte_size bigint not null check (byte_size between 1 and 20971520),
  width integer check (width is null or width between 1 and 8192),
  height integer check (height is null or height between 1 and 8192),
  sha256 text,
  moderation_status text not null default 'approved'
    check (moderation_status in ('pending', 'approved', 'rejected')),
  first_presented_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, ordinal)
);

create index image_generation_candidates_owner_idx
  on public.image_generation_candidates (owner_id, created_at desc);

create table public.image_generation_approval_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.image_generation_requests(id) on delete cascade,
  candidate_id uuid not null references public.image_generation_candidates(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('approved', 'placed')),
  surface text check (surface is null or surface in ('profile_image', 'profile_background')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.profile_imagery_assignments (
  user_id uuid not null references auth.users(id) on delete cascade,
  surface text not null check (surface in ('profile_image', 'profile_background')),
  candidate_id uuid not null references public.image_generation_candidates(id) on delete restrict,
  published_storage_path text not null,
  still_only_in_community boolean not null default true,
  motion_enabled_on_profile boolean not null default false,
  motion_preset text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, surface),
  constraint profile_imagery_motion_contract_check check (
    (motion_enabled_on_profile = false and motion_preset is null)
    or (motion_enabled_on_profile = true and motion_preset is not null)
  )
);

comment on table public.profile_imagery_assignments is
  'Accepted image placement. Community surfaces are always still-only; profile motion remains entitlement-gated and deferred.';

alter table public.profiles
  add column if not exists profile_background_path text;

comment on column public.profiles.profile_background_path is
  'Public still derivative path in profile-backgrounds. Candidate originals remain private.';

alter table public.membership_entitlements enable row level security;
alter table public.image_generation_requests enable row level security;
alter table public.image_generation_candidates enable row level security;
alter table public.image_generation_approval_events enable row level security;
alter table public.profile_imagery_assignments enable row level security;

create policy membership_entitlements_select_own
  on public.membership_entitlements for select to authenticated
  using (user_id = auth.uid());
create policy image_generation_requests_select_own
  on public.image_generation_requests for select to authenticated
  using (owner_id = auth.uid());
create policy image_generation_candidates_select_own
  on public.image_generation_candidates for select to authenticated
  using (owner_id = auth.uid());
create policy image_generation_approval_events_select_own
  on public.image_generation_approval_events for select to authenticated
  using (owner_id = auth.uid());
create policy profile_imagery_assignments_select_own
  on public.profile_imagery_assignments for select to authenticated
  using (user_id = auth.uid());

revoke all on public.membership_entitlements from anon, authenticated;
revoke all on public.image_generation_requests from anon, authenticated;
revoke all on public.image_generation_candidates from anon, authenticated;
revoke all on public.image_generation_approval_events from anon, authenticated;
revoke all on public.profile_imagery_assignments from anon, authenticated;
grant select on public.membership_entitlements to authenticated;
grant select on public.image_generation_requests to authenticated;
grant select on public.image_generation_candidates to authenticated;
grant select on public.image_generation_approval_events to authenticated;
grant select on public.profile_imagery_assignments to authenticated;
grant all on public.membership_entitlements to service_role;
grant all on public.image_generation_requests to service_role;
grant all on public.image_generation_candidates to service_role;
grant all on public.image_generation_approval_events to service_role;
grant all on public.profile_imagery_assignments to service_role;
grant usage, select on sequence public.image_generation_approval_events_id_seq to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'image-generation-candidates',
  'image-generation-candidates',
  false,
  20971520,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No storage.objects policies are created for image-generation-candidates.
-- Only the server service role may upload/download/sign candidate objects.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-backgrounds',
  'profile-backgrounds',
  true,
  20971520,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_backgrounds_public_read on storage.objects;
create policy profile_backgrounds_public_read
  on storage.objects for select to public
  using (bucket_id = 'profile-backgrounds');

create or replace function public.create_image_generation_request(
  p_owner_id uuid,
  p_prompt text,
  p_candidate_count smallint,
  p_idempotency_key text,
  p_provider text default 'unconfigured',
  p_model text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.image_generation_requests%rowtype;
begin
  if p_owner_id is null then raise exception 'owner required'; end if;
  if p_candidate_count is null or p_candidate_count not between 1 and 4 then
    raise exception 'candidate_count must be between 1 and 4';
  end if;
  if not exists (
    select 1 from public.membership_entitlements e
    where e.user_id = p_owner_id
      and e.entitlement = 'image_generator'
      and e.status = 'active'
      and (e.valid_until is null or e.valid_until > now())
  ) then
    raise exception using message = 'image_generator entitlement required', errcode = '42501';
  end if;

  insert into public.image_generation_requests (
    owner_id, prompt, candidate_count, idempotency_key, provider, model
  ) values (
    p_owner_id, trim(p_prompt), p_candidate_count, trim(p_idempotency_key),
    coalesce(nullif(trim(p_provider), ''), 'unconfigured'), nullif(trim(p_model), '')
  )
  on conflict (owner_id, idempotency_key) do update
    set idempotency_key = excluded.idempotency_key
  returning * into v_request;

  if v_request.prompt <> trim(p_prompt)
    or v_request.candidate_count <> p_candidate_count then
    raise exception 'idempotency key reused with different request';
  end if;

  return to_jsonb(v_request) - 'failure_detail';
end;
$$;

create or replace function public.claim_next_image_generation_request()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select r.id into v_id
  from public.image_generation_requests r
  where r.status = 'queued'
  order by r.created_at, r.id
  for update skip locked
  limit 1;

  if v_id is null then return null; end if;

  update public.image_generation_requests
  set status = 'running', claimed_at = now(), attempt_count = attempt_count + 1, updated_at = now()
  where id = v_id;

  return (
    select to_jsonb(r) - 'failure_detail'
    from public.image_generation_requests r where r.id = v_id
  );
end;
$$;

create or replace function public.register_image_generation_candidate(
  p_request_id uuid,
  p_ordinal smallint,
  p_storage_path text,
  p_mime_type text,
  p_byte_size bigint,
  p_width integer default null,
  p_height integer default null,
  p_sha256 text default null
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

  insert into public.image_generation_candidates (
    request_id, owner_id, ordinal, storage_path, mime_type, byte_size, width, height, sha256
  ) values (
    p_request_id, v_request.owner_id, p_ordinal, p_storage_path, p_mime_type,
    p_byte_size, p_width, p_height, nullif(trim(p_sha256), '')
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
    where c.request_id = p_request_id and c.status = 'review';
    if v_candidate_count < 1 then raise exception 'successful request requires a candidate'; end if;
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

create or replace function public.approve_image_generation_candidate(
  p_owner_id uuid,
  p_request_id uuid,
  p_candidate_id uuid
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
  where id = p_request_id and owner_id = p_owner_id for update;
  if not found then raise exception 'request not found'; end if;
  if v_request.status <> 'review' then raise exception 'request is not awaiting review'; end if;
  if v_request.review_expires_at is null or v_request.review_expires_at <= now() then
    update public.image_generation_requests set status = 'expired', updated_at = now() where id = p_request_id;
    update public.image_generation_candidates set status = 'expired', updated_at = now()
      where request_id = p_request_id and status = 'review';
    return jsonb_build_object('error', 'review_window_expired');
  end if;

  select * into v_candidate from public.image_generation_candidates
  where id = p_candidate_id and request_id = p_request_id and owner_id = p_owner_id
    and status = 'review' and moderation_status = 'approved'
  for update;
  if not found then raise exception 'candidate is not approvable'; end if;

  update public.image_generation_candidates
  set status = case when id = p_candidate_id then 'approved' else 'rejected' end,
      approved_at = case when id = p_candidate_id then now() else approved_at end,
      updated_at = now()
  where request_id = p_request_id and status = 'review';
  update public.image_generation_requests set status = 'approved', updated_at = now()
    where id = p_request_id;
  insert into public.image_generation_approval_events (request_id, candidate_id, owner_id, event_type)
    values (p_request_id, p_candidate_id, p_owner_id, 'approved');

  return (select to_jsonb(c) from public.image_generation_candidates c where c.id = p_candidate_id);
end;
$$;

create or replace function public.get_public_profile_imagery(p_profile_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when p.id is null then null else jsonb_build_object(
    'profile_id', p.id,
    'profile_image_path', nullif(trim(coalesce(p.avatar_path, '')), ''),
    'profile_background_path', nullif(trim(coalesce(p.profile_background_path, '')), ''),
    'still_only_in_community', true
  ) end
  from (select p_profile_id as requested_id) input
  left join public.profiles p on p.id = input.requested_id;
$$;

create or replace function public.cancel_image_generation_request(
  p_owner_id uuid,
  p_request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.image_generation_requests
  set status = 'cancelled', updated_at = now()
  where id = p_request_id and owner_id = p_owner_id and status in ('queued', 'review');
  if found then
    update public.image_generation_candidates set status = 'deleted', updated_at = now()
    where request_id = p_request_id and status = 'review';
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.place_approved_profile_image(
  p_owner_id uuid,
  p_candidate_id uuid,
  p_surface text,
  p_published_storage_path text
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
  select c.* into v_candidate
  from public.image_generation_candidates c
  join public.image_generation_requests r on r.id = c.request_id
  where c.id = p_candidate_id and c.owner_id = p_owner_id
    and c.status = 'approved' and r.status = 'approved'
  for update of c;
  if not found then raise exception 'approved candidate not found'; end if;

  insert into public.profile_imagery_assignments (
    user_id, surface, candidate_id, published_storage_path,
    still_only_in_community, motion_enabled_on_profile, motion_preset
  ) values (
    p_owner_id, p_surface, p_candidate_id, p_published_storage_path, true, false, null
  )
  on conflict (user_id, surface) do update set
    candidate_id = excluded.candidate_id,
    published_storage_path = excluded.published_storage_path,
    still_only_in_community = true,
    motion_enabled_on_profile = false,
    motion_preset = null,
    updated_at = now();

  if p_surface = 'profile_image' then
    update public.profiles set avatar_path = p_published_storage_path where id = p_owner_id;
  else
    update public.profiles set profile_background_path = p_published_storage_path where id = p_owner_id;
  end if;
  if not found then raise exception 'profile row not found'; end if;

  insert into public.image_generation_approval_events (
    request_id, candidate_id, owner_id, event_type, surface,
    metadata
  ) values (
    v_candidate.request_id, p_candidate_id, p_owner_id, 'placed', p_surface,
    jsonb_build_object('published_storage_path', p_published_storage_path)
  );
  return jsonb_build_object(
    'candidate_id', p_candidate_id,
    'surface', p_surface,
    'published_storage_path', p_published_storage_path,
    'motion_enabled_on_profile', false,
    'still_only_in_community', true
  );
end;
$$;

revoke all on function public.create_image_generation_request(uuid, text, smallint, text, text, text) from public;
revoke all on function public.claim_next_image_generation_request() from public;
revoke all on function public.register_image_generation_candidate(uuid, smallint, text, text, bigint, integer, integer, text) from public;
revoke all on function public.finalize_image_generation_request(uuid, boolean, text, text) from public;
revoke all on function public.approve_image_generation_candidate(uuid, uuid, uuid) from public;
revoke all on function public.cancel_image_generation_request(uuid, uuid) from public;
revoke all on function public.place_approved_profile_image(uuid, uuid, text, text) from public;
revoke all on function public.get_public_profile_imagery(uuid) from public;
grant execute on function public.create_image_generation_request(uuid, text, smallint, text, text, text) to service_role;
grant execute on function public.claim_next_image_generation_request() to service_role;
grant execute on function public.register_image_generation_candidate(uuid, smallint, text, text, bigint, integer, integer, text) to service_role;
grant execute on function public.finalize_image_generation_request(uuid, boolean, text, text) to service_role;
grant execute on function public.approve_image_generation_candidate(uuid, uuid, uuid) to service_role;
grant execute on function public.cancel_image_generation_request(uuid, uuid) to service_role;
grant execute on function public.place_approved_profile_image(uuid, uuid, text, text) to service_role;
grant execute on function public.get_public_profile_imagery(uuid) to anon, authenticated;

commit;
