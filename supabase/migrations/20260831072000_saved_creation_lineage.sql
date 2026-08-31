-- Preserve every accepted identity as a private, restorable Saved Creation.
-- Pro evolution opens a new token-funded commission and never overwrites its parent.

begin;

create table public.image_saved_creations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  candidate_id uuid not null unique references public.image_generation_candidates(id) on delete restrict,
  generation_request_id uuid not null unique references public.image_generation_requests(id) on delete restrict,
  parent_creation_id uuid references public.image_saved_creations(id) on delete restrict,
  root_creation_id uuid references public.image_saved_creations(id) on delete restrict,
  prompt_snapshot text not null,
  guidance_metadata jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.image_generation_requests
  add column parent_saved_creation_id uuid
    references public.image_saved_creations(id) on delete restrict;

create index image_saved_creations_owner_idx
  on public.image_saved_creations (owner_id, created_at desc);
create index image_saved_creations_parent_idx
  on public.image_saved_creations (parent_creation_id, created_at);

alter table public.image_saved_creations enable row level security;
create policy image_saved_creations_select_own
  on public.image_saved_creations for select to authenticated
  using (owner_id = (select auth.uid()));
revoke all on public.image_saved_creations from anon, authenticated;
grant select on public.image_saved_creations to authenticated;
grant all on public.image_saved_creations to service_role;

create or replace function public.preserve_approved_image_creation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.image_generation_requests%rowtype;
  v_parent public.image_saved_creations%rowtype;
  v_creation_id uuid;
begin
  if new.event_type <> 'approved' then return new; end if;
  select * into v_request from public.image_generation_requests where id = new.request_id;
  if not found then return new; end if;
  if v_request.parent_saved_creation_id is not null then
    select * into v_parent from public.image_saved_creations
    where id = v_request.parent_saved_creation_id and owner_id = new.owner_id;
    if not found then raise exception 'saved creation parent not found'; end if;
  end if;

  insert into public.image_saved_creations (
    owner_id, candidate_id, generation_request_id, parent_creation_id,
    root_creation_id, prompt_snapshot, guidance_metadata
  ) values (
    new.owner_id, new.candidate_id, new.request_id, v_request.parent_saved_creation_id,
    coalesce(v_parent.root_creation_id, v_parent.id), v_request.prompt,
    jsonb_build_object(
      'prompt_version', v_request.prompt_version,
      'membership_tier', v_request.membership_tier,
      'approval_event_id', new.id
    )
  ) on conflict (candidate_id) do nothing
  returning id into v_creation_id;

  if v_creation_id is not null and v_request.parent_saved_creation_id is null then
    update public.image_saved_creations set root_creation_id = v_creation_id
    where id = v_creation_id;
  end if;
  return new;
end;
$$;

create trigger preserve_approved_image_creation_trigger
after insert on public.image_generation_approval_events
for each row when (new.event_type = 'approved')
execute function public.preserve_approved_image_creation();

-- Preserve already-approved staging creations when the migration is introduced.
insert into public.image_saved_creations (
  owner_id, candidate_id, generation_request_id, prompt_snapshot, guidance_metadata
)
select c.owner_id, c.id, r.id, r.prompt,
  jsonb_build_object('prompt_version', r.prompt_version, 'membership_tier', r.membership_tier, 'backfilled', true)
from public.image_generation_candidates c
join public.image_generation_requests r on r.id = c.request_id
where c.status = 'approved'
on conflict (candidate_id) do nothing;
update public.image_saved_creations set root_creation_id = id where root_creation_id is null;

create or replace function public.create_saved_creation_evolution(
  p_owner_id uuid,
  p_saved_creation_id uuid,
  p_prompt text,
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
  v_parent public.image_saved_creations%rowtype;
  v_existing public.image_generation_requests%rowtype;
  v_request jsonb;
  v_request_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 719));
  v_tier := public.effective_image_generator_tier(p_owner_id);
  if v_tier not in ('pro', 'internal_unlimited') then
    raise exception 'furthering a saved creation requires Pro';
  end if;
  select * into v_parent from public.image_saved_creations
  where id = p_saved_creation_id and owner_id = p_owner_id and status = 'active'
  for update;
  if not found then raise exception 'saved creation not found'; end if;

  select * into v_existing from public.image_generation_requests
  where owner_id = p_owner_id and idempotency_key = trim(p_idempotency_key)
  for update;
  if found then
    if v_existing.parent_saved_creation_id is distinct from p_saved_creation_id then
      raise exception 'idempotency key reused with different saved creation';
    end if;
    return to_jsonb(v_existing) - 'failure_detail';
  end if;

  v_request := public.create_image_generation_request_with_references(
    p_owner_id, p_prompt, 5::smallint, p_idempotency_key,
    p_reference_ids, p_provider, p_model
  );
  v_request_id := (v_request ->> 'id')::uuid;
  update public.image_generation_requests
  set parent_saved_creation_id = p_saved_creation_id, updated_at = now()
  where id = v_request_id and parent_saved_creation_id is null;
  if not found then raise exception 'saved creation evolution could not be bound'; end if;
  return (
    select to_jsonb(r) - 'failure_detail'
    from public.image_generation_requests r where id = v_request_id
  );
end;
$$;

revoke all on function public.preserve_approved_image_creation()
  from public, anon, authenticated;
revoke all on function public.create_saved_creation_evolution(uuid, uuid, text, text, uuid[], text, text)
  from public, anon, authenticated;
grant execute on function public.create_saved_creation_evolution(uuid, uuid, text, text, uuid[], text, text)
  to service_role;

commit;
