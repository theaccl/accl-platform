-- Phase 7 hard wall for tournament integrity.

create table if not exists public.protected_position_fingerprints (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  fen_hash text not null,
  turn text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_protected_position_fingerprints_game_created
  on public.protected_position_fingerprints (game_id, created_at desc);

alter table public.protected_position_fingerprints enable row level security;

drop policy if exists "protected_position_fingerprints_service_role_select" on public.protected_position_fingerprints;
create policy "protected_position_fingerprints_service_role_select"
on public.protected_position_fingerprints
for select
to service_role
using (true);

drop policy if exists "protected_position_fingerprints_service_role_write" on public.protected_position_fingerprints;
create policy "protected_position_fingerprints_service_role_write"
on public.protected_position_fingerprints
for all
to service_role
using (true)
with check (true);

create or replace function public.record_tournament_position_fingerprint()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tournament_id is null then
    return new;
  end if;
  if new.status <> 'active' then
    return new;
  end if;

  insert into public.protected_position_fingerprints (game_id, tournament_id, fen_hash, turn)
  values (new.id, new.tournament_id, md5(coalesce(new.fen, '')), coalesce(new.turn, 'white'));

  return new;
end;
$$;

drop trigger if exists trg_games_record_tournament_position_fingerprint on public.games;
create trigger trg_games_record_tournament_position_fingerprint
after insert or update of fen, turn, status on public.games
for each row
execute function public.record_tournament_position_fingerprint();

create or replace function public.enforce_tournament_finality()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.tournament_id is null then
    return new;
  end if;

  if old.status = 'finished' and new.status <> 'finished' then
    raise exception 'Tournament games cannot reopen after finish';
  end if;
  if old.status = 'finished' and new.fen is distinct from old.fen then
    raise exception 'Tournament finished game board is immutable';
  end if;
  if old.status = 'finished' and new.result is distinct from old.result then
    raise exception 'Tournament result is final';
  end if;
  if old.status = 'finished' and new.end_reason is distinct from old.end_reason then
    raise exception 'Tournament end reason is final';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_games_enforce_tournament_finality on public.games;
create trigger trg_games_enforce_tournament_finality
before update on public.games
for each row
execute function public.enforce_tournament_finality();
