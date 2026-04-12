create table if not exists public.moderator_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  game_id uuid null,
  suspicion_tier text not null check (suspicion_tier in ('SOFT_LOCK_RECOMMENDED', 'ESCALATE_REVIEW')),
  suspicion_score integer not null default 0,
  recommended_action text not null,
  supporting_reasons_json jsonb not null default '[]'::jsonb,
  overlap_verdict text not null,
  queue_status text not null default 'OPEN' check (queue_status in ('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED')),
  assigned_to uuid null,
  moderator_note text null,
  resolution_note text null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_moderator_queue_status_created_at
  on public.moderator_queue (queue_status, created_at desc);

create index if not exists idx_moderator_queue_user_created_at
  on public.moderator_queue (user_id, created_at desc);

create index if not exists idx_moderator_queue_tier_created_at
  on public.moderator_queue (suspicion_tier, created_at desc);

create index if not exists idx_moderator_queue_recommended_action
  on public.moderator_queue (recommended_action);

create or replace function public.set_moderator_queue_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_moderator_queue_set_updated_at on public.moderator_queue;
create trigger trg_moderator_queue_set_updated_at
before update on public.moderator_queue
for each row
execute function public.set_moderator_queue_updated_at();

alter table public.moderator_queue enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'moderator_queue'
      and policyname = 'moderator_queue_service_role_full_access'
  ) then
    create policy moderator_queue_service_role_full_access
      on public.moderator_queue
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end
$$;
