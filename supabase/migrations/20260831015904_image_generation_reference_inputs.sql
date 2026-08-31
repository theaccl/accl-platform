-- Optional private reference images for Image Generator requests.
-- References are sanitized by the server, used once, and never published.

begin;

create table public.image_generation_references (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'ready'
    check (status in ('ready', 'cleanup_pending', 'deleted', 'rejected')),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  byte_size bigint not null check (byte_size between 1 and 4194304),
  width integer not null check (width between 256 and 4096),
  height integer not null check (height between 256 and 4096),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.image_generation_references is
  'Server-sanitized private reference images. They steer one generation request and are never publishable profile assets.';

alter table public.image_generation_requests
  add column reference_id uuid references public.image_generation_references(id) on delete restrict;

create unique index image_generation_requests_reference_once_idx
  on public.image_generation_requests (reference_id)
  where reference_id is not null;
create index image_generation_references_owner_created_idx
  on public.image_generation_references (owner_id, created_at desc);
create index image_generation_references_cleanup_idx
  on public.image_generation_references (expires_at, id)
  where status in ('ready', 'cleanup_pending');

alter table public.image_generation_references enable row level security;

create policy image_generation_references_select_own
  on public.image_generation_references for select to authenticated
  using (owner_id = (select auth.uid()));

revoke all on public.image_generation_references from anon, authenticated;
grant select on public.image_generation_references to authenticated;
grant all on public.image_generation_references to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'image-generation-references',
  'image-generation-references',
  false,
  4194304,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- No storage.objects policies are created for image-generation-references.
-- Only server service-role routes may upload, download, or delete references.

drop function if exists public.create_image_generation_request(uuid, text, smallint, text, text, text);

create function public.create_image_generation_request(
  p_owner_id uuid,
  p_prompt text,
  p_candidate_count smallint,
  p_idempotency_key text,
  p_reference_id uuid default null,
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
  v_reference public.image_generation_references%rowtype;
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

  if p_reference_id is not null then
    select * into v_reference
    from public.image_generation_references r
    where r.id = p_reference_id and r.owner_id = p_owner_id
    for update;
    if not found or v_reference.status <> 'ready' or v_reference.expires_at <= now() then
      raise exception 'reference image is unavailable';
    end if;
  end if;

  insert into public.image_generation_requests (
    owner_id, prompt, candidate_count, idempotency_key, provider, model, reference_id
  ) values (
    p_owner_id, trim(p_prompt), p_candidate_count, trim(p_idempotency_key),
    coalesce(nullif(trim(p_provider), ''), 'unconfigured'), nullif(trim(p_model), ''), p_reference_id
  )
  on conflict (owner_id, idempotency_key) do update
    set idempotency_key = excluded.idempotency_key
  returning * into v_request;

  if v_request.prompt <> trim(p_prompt)
    or v_request.candidate_count <> p_candidate_count
    or v_request.reference_id is distinct from p_reference_id then
    raise exception 'idempotency key reused with different request';
  end if;

  return to_jsonb(v_request) - 'failure_detail';
end;
$$;

revoke all on function public.create_image_generation_request(uuid, text, smallint, text, uuid, text, text) from public;
grant execute on function public.create_image_generation_request(uuid, text, smallint, text, uuid, text, text) to service_role;

commit;
