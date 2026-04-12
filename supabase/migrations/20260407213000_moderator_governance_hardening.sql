alter table public.moderator_queue
  add column if not exists anti_cheat_event_id uuid null references public.anti_cheat_events (id) on delete set null;

create index if not exists idx_moderator_queue_anti_cheat_event_id
  on public.moderator_queue (anti_cheat_event_id);

create table if not exists public.moderator_role_bindings (
  user_id uuid primary key,
  role text not null check (role in ('MODERATOR', 'ADMIN')),
  granted_by uuid null,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.moderator_role_bindings enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'moderator_role_bindings'
      and policyname = 'moderator_role_bindings_service_role_full_access'
  ) then
    create policy moderator_role_bindings_service_role_full_access
      on public.moderator_role_bindings
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end
$$;

create table if not exists public.moderator_queue_action_history (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid not null references public.moderator_queue (id) on delete cascade,
  acted_by uuid not null,
  action_type text not null check (action_type in ('MARK_IN_REVIEW', 'MARK_RESOLVED', 'MARK_DISMISSED')),
  previous_status text not null check (previous_status in ('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED')),
  new_status text not null check (new_status in ('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED')),
  moderator_note text null,
  resolution_note text null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_mq_action_history_queue_created_at
  on public.moderator_queue_action_history (queue_id, created_at asc);

create or replace function public.prevent_moderator_queue_action_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'moderator_queue_action_history is append-only';
end;
$$;

drop trigger if exists trg_mq_action_history_prevent_update on public.moderator_queue_action_history;
create trigger trg_mq_action_history_prevent_update
before update on public.moderator_queue_action_history
for each row
execute function public.prevent_moderator_queue_action_history_mutation();

drop trigger if exists trg_mq_action_history_prevent_delete on public.moderator_queue_action_history;
create trigger trg_mq_action_history_prevent_delete
before delete on public.moderator_queue_action_history
for each row
execute function public.prevent_moderator_queue_action_history_mutation();

alter table public.moderator_queue_action_history enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'moderator_queue_action_history'
      and policyname = 'moderator_queue_action_history_service_role_full_access'
  ) then
    create policy moderator_queue_action_history_service_role_full_access
      on public.moderator_queue_action_history
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'moderator_queue'
      and policyname = 'moderator_queue_mod_admin_read_write'
  ) then
    create policy moderator_queue_mod_admin_read_write
      on public.moderator_queue
      for all
      to authenticated
      using (
        exists (
          select 1
          from public.moderator_role_bindings mrb
          where mrb.user_id = auth.uid()
            and mrb.role in ('MODERATOR', 'ADMIN')
        )
      )
      with check (
        exists (
          select 1
          from public.moderator_role_bindings mrb
          where mrb.user_id = auth.uid()
            and mrb.role in ('MODERATOR', 'ADMIN')
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'moderator_queue_action_history'
      and policyname = 'moderator_queue_action_history_mod_admin_read'
  ) then
    create policy moderator_queue_action_history_mod_admin_read
      on public.moderator_queue_action_history
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.moderator_role_bindings mrb
          where mrb.user_id = auth.uid()
            and mrb.role in ('MODERATOR', 'ADMIN')
        )
      );
  end if;
end
$$;
