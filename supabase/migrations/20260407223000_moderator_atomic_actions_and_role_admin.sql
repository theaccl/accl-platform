create table if not exists public.moderator_role_audit_history (
  id uuid primary key default gen_random_uuid(),
  acted_by uuid not null,
  target_user_id uuid not null,
  role_granted_or_revoked text not null check (role_granted_or_revoked in ('GRANTED_MODERATOR', 'REVOKED_MODERATOR')),
  previous_roles jsonb not null default '[]'::jsonb,
  new_roles jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_moderator_role_audit_target_created_at
  on public.moderator_role_audit_history (target_user_id, created_at desc);

alter table public.moderator_role_audit_history enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'moderator_role_audit_history'
      and policyname = 'moderator_role_audit_history_service_role_full_access'
  ) then
    create policy moderator_role_audit_history_service_role_full_access
      on public.moderator_role_audit_history
      for all
      to service_role
      using (true)
      with check (true);
  end if;
 end;
$$;

create or replace function public.apply_moderator_queue_action_atomic(
  p_queue_id uuid,
  p_acted_by uuid,
  p_action_type text,
  p_moderator_note text default null,
  p_resolution_note text default null
)
returns public.moderator_queue
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.moderator_queue%rowtype;
  v_new_status text;
  v_updated public.moderator_queue%rowtype;
begin
  if p_action_type not in ('MARK_IN_REVIEW', 'MARK_RESOLVED', 'MARK_DISMISSED') then
    raise exception 'invalid moderator action type: %', p_action_type;
  end if;

  select *
  into v_existing
  from public.moderator_queue
  where id = p_queue_id
  for update;

  if not found then
    return null;
  end if;

  v_new_status := case
    when p_action_type = 'MARK_IN_REVIEW' then 'IN_REVIEW'
    when p_action_type = 'MARK_RESOLVED' then 'RESOLVED'
    else 'DISMISSED'
  end;

  update public.moderator_queue
  set
    queue_status = v_new_status,
    assigned_to = p_acted_by,
    moderator_note = case
      when p_action_type = 'MARK_IN_REVIEW' then p_moderator_note
      else moderator_note
    end,
    resolution_note = case
      when p_action_type in ('MARK_RESOLVED', 'MARK_DISMISSED') then p_resolution_note
      else resolution_note
    end
  where id = p_queue_id
  returning * into v_updated;

  insert into public.moderator_queue_action_history (
    queue_id,
    acted_by,
    action_type,
    previous_status,
    new_status,
    moderator_note,
    resolution_note
  )
  values (
    v_updated.id,
    p_acted_by,
    p_action_type,
    v_existing.queue_status,
    v_new_status,
    case when p_action_type = 'MARK_IN_REVIEW' then p_moderator_note else v_existing.moderator_note end,
    case when p_action_type in ('MARK_RESOLVED', 'MARK_DISMISSED') then p_resolution_note else v_existing.resolution_note end
  );

  return v_updated;
end;
$$;

revoke all on function public.apply_moderator_queue_action_atomic(uuid, uuid, text, text, text) from public;
grant execute on function public.apply_moderator_queue_action_atomic(uuid, uuid, text, text, text) to service_role;

create or replace function public.set_moderator_role_binding(
  p_acted_by uuid,
  p_target_user_id uuid,
  p_grant boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
  v_target_role text;
  v_previous_roles jsonb := '[]'::jsonb;
  v_new_roles jsonb := '[]'::jsonb;
  v_event text;
  v_created_at timestamptz := timezone('utc', now());
begin
  if p_acted_by is null or p_target_user_id is null then
    raise exception 'acted_by and target_user_id are required';
  end if;
  if p_acted_by = p_target_user_id then
    raise exception 'self role mutation is not allowed';
  end if;

  select role into v_actor_role
  from public.moderator_role_bindings
  where user_id = p_acted_by;
  if v_actor_role is distinct from 'ADMIN' then
    raise exception 'admin role required for role mutation';
  end if;

  select role into v_target_role
  from public.moderator_role_bindings
  where user_id = p_target_user_id;

  if v_target_role is not null then
    v_previous_roles := jsonb_build_array(v_target_role);
  end if;

  if p_grant then
    if v_target_role is null or v_target_role = 'MODERATOR' then
      insert into public.moderator_role_bindings (user_id, role, granted_by)
      values (p_target_user_id, 'MODERATOR', p_acted_by)
      on conflict (user_id) do update
      set role = 'MODERATOR',
          granted_by = excluded.granted_by;
    elsif v_target_role = 'ADMIN' then
      raise exception 'cannot downgrade existing ADMIN role via moderator grant';
    end if;
    v_new_roles := '["MODERATOR"]'::jsonb;
    v_event := 'GRANTED_MODERATOR';
  else
    if v_target_role = 'MODERATOR' then
      delete from public.moderator_role_bindings where user_id = p_target_user_id;
    end if;
    if v_target_role = 'ADMIN' then
      v_new_roles := '["ADMIN"]'::jsonb;
    else
      v_new_roles := '[]'::jsonb;
    end if;
    v_event := 'REVOKED_MODERATOR';
  end if;

  insert into public.moderator_role_audit_history (
    acted_by,
    target_user_id,
    role_granted_or_revoked,
    previous_roles,
    new_roles,
    created_at
  )
  values (
    p_acted_by,
    p_target_user_id,
    v_event,
    v_previous_roles,
    v_new_roles,
    v_created_at
  );

  return jsonb_build_object(
    'acted_by', p_acted_by,
    'target_user_id', p_target_user_id,
    'role_granted_or_revoked', v_event,
    'previous_roles', v_previous_roles,
    'new_roles', v_new_roles,
    'created_at', v_created_at
  );
end;
$$;

revoke all on function public.set_moderator_role_binding(uuid, uuid, boolean) from public;
grant execute on function public.set_moderator_role_binding(uuid, uuid, boolean) to service_role;
