-- Return an intentional contract error for consumed reference reuse while
-- preserving an exact idempotent replay of the original commission.

begin;

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

  foreach v_reference_id in array p_reference_ids loop
    select * into v_reference
    from public.image_generation_references r
    where r.id = v_reference_id and r.owner_id = p_owner_id
    for update;
    if not found or v_reference.status <> 'ready' or v_reference.expires_at <= now() then
      raise exception 'reference image is unavailable';
    end if;
    if v_reference.request_id is not null
      and v_reference.request_id is distinct from v_existing.id then
      raise exception 'reference image was already used';
    end if;
  end loop;

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

commit;
