-- Vault relic records foundation (storage + read-only player access).
-- This migration intentionally does NOT implement award generation logic.

create table if not exists public.vault_relic_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  category text not null
    constraint vault_relic_records_category_check check (category in ('free', 'tournament')),
  date_won timestamptz null,
  source_game_id uuid null references public.games (id) on delete set null,
  source_tournament_id uuid null references public.tournaments (id) on delete set null,
  pace text null
    constraint vault_relic_records_pace_check check (
      pace is null or pace in ('live', 'daily', 'correspondence')
    ),
  description text null,
  created_at timestamptz not null default now()
);

comment on table public.vault_relic_records is
  'Persisted earned relic records for profile Vault display. Read-only for players; award generation is deferred.';

comment on column public.vault_relic_records.category is
  'Structural split: free vs tournament relic pathways.';

comment on column public.vault_relic_records.source_game_id is
  'Optional game origin for relic lineage.';

comment on column public.vault_relic_records.source_tournament_id is
  'Optional tournament origin for relic lineage.';

create index if not exists vault_relic_records_user_created_idx
  on public.vault_relic_records (user_id, created_at desc);

create index if not exists vault_relic_records_user_category_date_idx
  on public.vault_relic_records (user_id, category, date_won desc nulls last, created_at desc);

alter table public.vault_relic_records enable row level security;

drop policy if exists "vault_relic_records_select_own" on public.vault_relic_records;

create policy "vault_relic_records_select_own"
  on public.vault_relic_records
  for select
  to authenticated
  using (auth.uid() = user_id);

grant select on public.vault_relic_records to authenticated;
