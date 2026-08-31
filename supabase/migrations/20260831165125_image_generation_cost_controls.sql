-- Immutable Image Generator cost receipts and server-only emergency controls.
-- The dollar ceiling is an operational safety limit, not a player-facing price.

begin;

create table public.image_generation_operator_controls (
  control_key text primary key check (control_key = 'global'),
  generation_enabled boolean not null default true,
  max_provider_cost_usd_per_commission numeric(12, 8) not null default 1.00000000
    check (max_provider_cost_usd_per_commission > 0),
  max_attempts_per_job smallint not null default 3
    check (max_attempts_per_job between 1 and 3),
  max_unpriced_provider_events_per_commission smallint not null default 1
    check (max_unpriced_provider_events_per_commission between 0 and 3),
  updated_at timestamptz not null default now()
);

comment on table public.image_generation_operator_controls is
  'Server-only emergency switches and spend ceilings. Values are operational safeguards, never membership prices.';

insert into public.image_generation_operator_controls (
  control_key,
  generation_enabled,
  max_provider_cost_usd_per_commission,
  max_attempts_per_job,
  max_unpriced_provider_events_per_commission
) values ('global', true, 1.00000000, 3, 1)
on conflict (control_key) do nothing;

create table public.image_generation_cost_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.image_generation_requests(id) on delete cascade,
  refinement_id uuid references public.image_generation_refinements(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('provider_generation', 'derivative_compute')),
  operation text not null check (operation in ('opening', 'refinement', 'placement_derivative')),
  attempt_number smallint not null check (attempt_number between 1 and 3),
  provider text,
  model text,
  generated_image_count smallint not null default 0
    check (generated_image_count between 0 and 5),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  total_tokens integer check (total_tokens is null or total_tokens >= 0),
  provider_cost_usd numeric(12, 8)
    check (provider_cost_usd is null or provider_cost_usd >= 0),
  measured_duration_ms bigint not null check (measured_duration_ms >= 0),
  output_bytes bigint not null default 0 check (output_bytes >= 0),
  idempotency_key text not null unique
    check (char_length(idempotency_key) between 12 and 240),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint image_generation_cost_event_shape_check check (
    (
      event_type = 'provider_generation'
      and operation in ('opening', 'refinement')
      and provider is not null
      and model is not null
      and generated_image_count between 1 and 5
    )
    or (
      event_type = 'derivative_compute'
      and operation = 'placement_derivative'
      and provider is null
      and model is null
      and generated_image_count = 0
    )
  )
);

comment on table public.image_generation_cost_events is
  'Immutable server-only receipts for actual Gateway spend and measured placement-derivative work, grouped by commission.';

create index image_generation_cost_events_request_idx
  on public.image_generation_cost_events (request_id, created_at, id);
create index image_generation_cost_events_owner_idx
  on public.image_generation_cost_events (owner_id, created_at desc);
create index image_generation_cost_events_refinement_idx
  on public.image_generation_cost_events (refinement_id)
  where refinement_id is not null;

alter table public.image_generation_operator_controls enable row level security;
alter table public.image_generation_cost_events enable row level security;

revoke all on public.image_generation_operator_controls from public, anon, authenticated;
revoke all on public.image_generation_cost_events from public, anon, authenticated;
revoke all on public.image_generation_operator_controls from service_role;
revoke all on public.image_generation_cost_events from service_role;
grant select on public.image_generation_operator_controls to service_role;
grant update (
  generation_enabled,
  max_provider_cost_usd_per_commission,
  max_attempts_per_job,
  max_unpriced_provider_events_per_commission,
  updated_at
) on public.image_generation_operator_controls to service_role;
grant select on public.image_generation_cost_events to service_role;
grant usage, select on sequence public.image_generation_cost_events_id_seq to service_role;

create policy image_generation_cost_events_deny_client_access
  on public.image_generation_cost_events
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

create policy image_generation_operator_controls_deny_client_access
  on public.image_generation_operator_controls
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

create or replace function public.enforce_image_generation_cost_guard(
  p_request_id uuid,
  p_refinement_id uuid default null,
  p_attempt_number integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.image_generation_requests%rowtype;
  v_controls public.image_generation_operator_controls%rowtype;
  v_known_cost numeric(12, 8);
  v_unpriced_events integer;
begin
  select * into v_request
  from public.image_generation_requests
  where id = p_request_id;
  if not found then raise exception 'generation request not found'; end if;

  if p_refinement_id is not null and not exists (
    select 1 from public.image_generation_refinements f
    where f.id = p_refinement_id
      and f.request_id = p_request_id
      and f.owner_id = v_request.owner_id
  ) then
    raise exception 'generation refinement does not belong to request';
  end if;

  select * into v_controls
  from public.image_generation_operator_controls
  where control_key = 'global';
  if not found or not v_controls.generation_enabled then
    raise exception using message = 'image generation is temporarily unavailable', errcode = '55000';
  end if;
  if p_attempt_number < 1 or p_attempt_number > v_controls.max_attempts_per_job then
    raise exception using message = 'image generation attempt ceiling reached', errcode = '54000';
  end if;

  select
    coalesce(sum(provider_cost_usd), 0),
    count(*) filter (where provider_cost_usd is null)
  into v_known_cost, v_unpriced_events
  from public.image_generation_cost_events
  where request_id = p_request_id
    and event_type = 'provider_generation';

  if v_known_cost >= v_controls.max_provider_cost_usd_per_commission then
    raise exception using message = 'image generation commission cost ceiling reached', errcode = '54000';
  end if;
  if v_unpriced_events > 0
    and v_unpriced_events >= v_controls.max_unpriced_provider_events_per_commission then
    raise exception using message = 'image generation cost receipt unavailable', errcode = '55000';
  end if;

  return jsonb_build_object(
    'allowed', true,
    'known_provider_cost_usd', v_known_cost,
    'max_provider_cost_usd', v_controls.max_provider_cost_usd_per_commission,
    'unpriced_provider_events', v_unpriced_events
  );
end;
$$;

create or replace function public.record_image_generation_cost_event(
  p_request_id uuid,
  p_event_type text,
  p_operation text,
  p_attempt_number integer,
  p_idempotency_key text,
  p_refinement_id uuid default null,
  p_provider text default null,
  p_model text default null,
  p_generated_image_count integer default 0,
  p_input_tokens integer default null,
  p_output_tokens integer default null,
  p_total_tokens integer default null,
  p_provider_cost_usd numeric default null,
  p_measured_duration_ms bigint default 0,
  p_output_bytes bigint default 0,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.image_generation_requests%rowtype;
  v_event public.image_generation_cost_events%rowtype;
begin
  select * into v_request
  from public.image_generation_requests
  where id = p_request_id;
  if not found then raise exception 'generation request not found'; end if;

  if p_refinement_id is not null and not exists (
    select 1 from public.image_generation_refinements f
    where f.id = p_refinement_id
      and f.request_id = p_request_id
      and f.owner_id = v_request.owner_id
  ) then
    raise exception 'generation refinement does not belong to request';
  end if;

  insert into public.image_generation_cost_events (
    request_id, refinement_id, owner_id, event_type, operation, attempt_number,
    provider, model, generated_image_count, input_tokens, output_tokens, total_tokens,
    provider_cost_usd, measured_duration_ms, output_bytes, idempotency_key, metadata
  ) values (
    p_request_id, p_refinement_id, v_request.owner_id, p_event_type, p_operation,
    p_attempt_number, nullif(trim(p_provider), ''), nullif(trim(p_model), ''),
    p_generated_image_count, p_input_tokens, p_output_tokens, p_total_tokens,
    p_provider_cost_usd, p_measured_duration_ms, p_output_bytes,
    trim(p_idempotency_key), coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (idempotency_key) do nothing
  returning * into v_event;

  if not found then
    select * into v_event
    from public.image_generation_cost_events
    where idempotency_key = trim(p_idempotency_key);
    if v_event.request_id <> p_request_id
      or v_event.owner_id <> v_request.owner_id
      or v_event.event_type <> p_event_type
      or v_event.operation <> p_operation
      or v_event.attempt_number <> p_attempt_number
      or v_event.refinement_id is distinct from p_refinement_id
      or v_event.provider is distinct from nullif(trim(p_provider), '')
      or v_event.model is distinct from nullif(trim(p_model), '')
      or v_event.generated_image_count <> p_generated_image_count
      or v_event.input_tokens is distinct from p_input_tokens
      or v_event.output_tokens is distinct from p_output_tokens
      or v_event.total_tokens is distinct from p_total_tokens
      or v_event.provider_cost_usd is distinct from p_provider_cost_usd
      or v_event.measured_duration_ms <> p_measured_duration_ms
      or v_event.output_bytes <> p_output_bytes
      or v_event.metadata <> coalesce(p_metadata, '{}'::jsonb)
    then
      raise exception 'cost event idempotency key reused with different input';
    end if;
  end if;

  return jsonb_build_object(
    'id', v_event.id,
    'request_id', v_event.request_id,
    'event_type', v_event.event_type,
    'provider_cost_usd', v_event.provider_cost_usd,
    'created_at', v_event.created_at
  );
end;
$$;

revoke all on function public.enforce_image_generation_cost_guard(uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.record_image_generation_cost_event(
  uuid, text, text, integer, text, uuid, text, text, integer, integer, integer,
  integer, numeric, bigint, bigint, jsonb
) from public, anon, authenticated;

grant execute on function public.enforce_image_generation_cost_guard(uuid, uuid, integer)
  to service_role;
grant execute on function public.record_image_generation_cost_event(
  uuid, text, text, integer, text, uuid, text, text, integer, integer, integer,
  integer, numeric, bigint, bigint, jsonb
) to service_role;

commit;
