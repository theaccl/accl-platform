-- Jurisdiction/tournament eligibility metadata scaffold.
-- Intentionally policy-neutral: legal rule logic lives in app policy layer.

create table if not exists public.user_eligibility (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  country text null,
  region text null,
  eligibility_status text not null
    constraint user_eligibility_status_check check (
      eligibility_status in ('FULL_TOURNAMENT_ACCESS', 'FREE_ONLY', 'TRAINING_ONLY', 'BLOCKED')
    ),
  reason text not null default '',
  last_verified_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_eligibility_status_idx
  on public.user_eligibility (eligibility_status);

alter table public.user_eligibility enable row level security;

drop policy if exists "user_eligibility_self_read" on public.user_eligibility;
create policy "user_eligibility_self_read"
  on public.user_eligibility for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "user_eligibility_self_upsert" on public.user_eligibility;
create policy "user_eligibility_self_upsert"
  on public.user_eligibility for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select, insert, update on public.user_eligibility to authenticated;
