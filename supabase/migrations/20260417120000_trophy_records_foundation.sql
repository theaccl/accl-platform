-- Trophy records foundation (storage + read-only player access).
-- No award generation logic in this migration.

create table if not exists public.trophy_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  category text not null
    constraint trophy_records_category_not_blank check (btrim(category) <> ''),
  date_awarded timestamptz null,
  source_game_id uuid null references public.games (id) on delete set null,
  source_tournament_id uuid null references public.tournaments (id) on delete set null,
  placement integer null
    constraint trophy_records_placement_positive check (placement is null or placement > 0),
  level text null,
  description text null,
  created_at timestamptz not null default now()
);

comment on table public.trophy_records is
  'Persisted major achievement records for profile trophy display. Award rules are deferred.';

comment on column public.trophy_records.category is
  'Trophy category namespace (e.g., tournament/free/platform milestones).';

comment on column public.trophy_records.placement is
  'Optional rank/placement (e.g., 1 for champion).';

comment on column public.trophy_records.level is
  'Optional trophy level tier label.';

create index if not exists trophy_records_user_created_idx
  on public.trophy_records (user_id, created_at desc);

create index if not exists trophy_records_user_category_awarded_idx
  on public.trophy_records (user_id, category, date_awarded desc nulls last, created_at desc);

alter table public.trophy_records enable row level security;

drop policy if exists "trophy_records_select_own" on public.trophy_records;

create policy "trophy_records_select_own"
  on public.trophy_records
  for select
  to authenticated
  using (auth.uid() = user_id);

grant select on public.trophy_records to authenticated;

revoke insert, update, delete on table public.trophy_records from authenticated;
revoke insert, update, delete on table public.trophy_records from anon;
revoke insert, update, delete on table public.trophy_records from public;
