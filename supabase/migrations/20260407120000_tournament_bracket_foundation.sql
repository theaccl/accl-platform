-- Pass #8: tournaments, entries, matches; advancement + spawn games; completion.
-- Separated from free play; tournament rating still deferred (classification only elsewhere).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'pending'
    constraint tournaments_status_check check (status in ('pending', 'active', 'completed')),
  format text not null default 'single_elimination'
    constraint tournaments_format_check check (format in ('single_elimination')),
  tempo text not null default 'live',
  live_time_control text null,
  rated boolean not null default true,
  created_by uuid null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_entries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  seed integer null,
  eliminated boolean not null default false,
  current_round integer not null default 1,
  created_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);

create index if not exists tournament_entries_tournament_seed_idx
  on public.tournament_entries (tournament_id, seed);

create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  round_number integer not null,
  match_number integer not null,
  player1_id uuid null references public.profiles (id) on delete set null,
  player2_id uuid null references public.profiles (id) on delete set null,
  game_id uuid null references public.games (id) on delete set null,
  winner_id uuid null references public.profiles (id) on delete set null,
  next_match_id uuid null references public.tournament_matches (id) on delete set null,
  advance_winner_as text null
    constraint tournament_matches_advance_check check (
      advance_winner_as is null or advance_winner_as in ('player1', 'player2')
    ),
  unique (tournament_id, round_number, match_number)
);

create index if not exists tournament_matches_tournament_round_idx
  on public.tournament_matches (tournament_id, round_number);

alter table public.tournaments
  add column if not exists created_by uuid null references public.profiles (id) on delete set null;

-- Optional FK: games.tournament_id → tournaments
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'games_tournament_id_fkey'
  ) then
    alter table public.games
      add constraint games_tournament_id_fkey
      foreign key (tournament_id) references public.tournaments (id) on delete set null;
  end if;
exception
  when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.tournament_winner_from_game(g public.games)
returns uuid
language sql
stable
as $$
  select case
    when g.winner_id is not null then g.winner_id
    when g.result = 'white_win' then g.white_player_id
    when g.result = 'black_win' then g.black_player_id
    else null
  end;
$$;

create or replace function public.tournament_try_spawn_game(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.tournament_matches%rowtype;
  t public.tournaments%rowtype;
  gid uuid;
  v_fen text := 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
begin
  select * into m from public.tournament_matches where id = p_match_id for update;
  if not found then
    return;
  end if;

  if m.game_id is not null or m.winner_id is not null then
    return;
  end if;
  if m.player1_id is null or m.player2_id is null then
    return;
  end if;

  select * into t from public.tournaments where id = m.tournament_id;
  if not found then
    return;
  end if;

  insert into public.games (
    white_player_id,
    black_player_id,
    status,
    fen,
    turn,
    mode,
    play_context,
    tournament_id,
    tempo,
    live_time_control,
    rated,
    source_type,
    last_move_at,
    move_deadline_at,
    white_clock_ms,
    black_clock_ms
  )
  values (
    m.player1_id,
    m.player2_id,
    'active',
    v_fen,
    'white',
    'PIT',
    'tournament',
    m.tournament_id,
    coalesce(nullif(trim(lower(t.tempo)), ''), 'live'),
    t.live_time_control,
    t.rated,
    'tournament_bracket',
    null,
    null,
    null,
    null
  )
  returning id into gid;

  update public.tournament_matches set game_id = gid where id = p_match_id;
end;
$$;

create or replace function public.tournament_propagate_winner(p_match_id uuid, p_winner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.tournament_matches%rowtype;
  v_next uuid;
  v_slot text;
  v_loser uuid;
  v_tid uuid;
  v_round int;
begin
  if p_winner is null then
    return;
  end if;

  select * into m from public.tournament_matches where id = p_match_id for update;
  if not found then
    return;
  end if;

  if m.winner_id is not null then
    return;
  end if;

  update public.tournament_matches set winner_id = p_winner where id = p_match_id;
  v_tid := m.tournament_id;
  v_round := m.round_number;

  if m.player1_id is not null and m.player1_id <> p_winner then
    v_loser := m.player1_id;
  elsif m.player2_id is not null and m.player2_id <> p_winner then
    v_loser := m.player2_id;
  else
    v_loser := null;
  end if;

  if v_loser is not null then
    update public.tournament_entries
    set eliminated = true,
        current_round = greatest(current_round, v_round)
    where tournament_id = v_tid and user_id = v_loser and not eliminated;
  end if;

  update public.tournament_entries
  set current_round = greatest(current_round, v_round + 1)
  where tournament_id = v_tid and user_id = p_winner;

  v_next := m.next_match_id;
  v_slot := m.advance_winner_as;

  if v_next is null then
    update public.tournaments set status = 'completed' where id = v_tid and status <> 'completed';
    return;
  end if;

  if v_slot = 'player1' then
    update public.tournament_matches set player1_id = p_winner where id = v_next;
  elsif v_slot = 'player2' then
    update public.tournament_matches set player2_id = p_winner where id = v_next;
  end if;

  perform public.tournament_process_bye_or_spawn(v_next);
end;
$$;

create or replace function public.tournament_process_bye_or_spawn(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.tournament_matches%rowtype;
  v_w uuid;
begin
  select * into m from public.tournament_matches where id = p_match_id for update;
  if not found then
    return;
  end if;

  if m.winner_id is not null or m.game_id is not null then
    return;
  end if;

  if m.player1_id is not null and m.player2_id is not null then
    perform public.tournament_try_spawn_game(p_match_id);
    return;
  end if;

  -- Structural byes only exist in round 1 (power-of-2 padding). Later rounds may have one
  -- player temporarily while waiting for the sibling feeder; do not complete those as byes.
  if m.round_number > 1 then
    return;
  end if;

  if m.player1_id is not null and m.player2_id is null then
    v_w := m.player1_id;
  elsif m.player2_id is not null and m.player1_id is null then
    v_w := m.player2_id;
  else
    return;
  end if;

  perform public.tournament_propagate_winner(p_match_id, v_w);
end;
$$;

create or replace function public.tournament_handle_finished_game(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games%rowtype;
  m public.tournament_matches%rowtype;
  w uuid;
begin
  select * into g from public.games where id = p_game_id;
  if not found then
    return;
  end if;
  if g.play_context is distinct from 'tournament' or g.tournament_id is null then
    return;
  end if;

  select * into m from public.tournament_matches where game_id = p_game_id for update;
  if not found then
    return;
  end if;
  if m.winner_id is not null then
    return;
  end if;

  w := public.tournament_winner_from_game(g);
  if w is null then
    return;
  end if;

  perform public.tournament_propagate_winner(m.id, w);
end;
$$;

create or replace function public.tournament_bootstrap_round(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  m public.tournament_matches%rowtype;
begin
  for m in
    select * from public.tournament_matches
    where tournament_id = p_tournament_id and round_number = 1
    order by match_number
  loop
    perform public.tournament_process_bye_or_spawn(m.id);
  end loop;
end;
$$;

grant execute on function public.tournament_bootstrap_round(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Trigger: finished tournament games → advancement (rating still deferred)
-- ---------------------------------------------------------------------------

create or replace function public.trg_games_tournament_finish_advance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'finished'
     and old.status is distinct from 'finished'
     and new.play_context = 'tournament' then
    perform public.tournament_handle_finished_game(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists games_tournament_finish_advance on public.games;

create trigger games_tournament_finish_advance
  after update of status on public.games
  for each row
  when (new.status = 'finished' and old.status is distinct from 'finished')
  execute function public.trg_games_tournament_finish_advance();

-- ---------------------------------------------------------------------------
-- RLS (foundation: participants can read tournaments they are in)
-- ---------------------------------------------------------------------------

alter table public.tournaments enable row level security;
alter table public.tournament_entries enable row level security;
alter table public.tournament_matches enable row level security;

create policy "tournaments_read_participant"
  on public.tournaments for select
  to authenticated
  using (
    created_by = (select auth.uid())
    or exists (
      select 1 from public.tournament_entries e
      where e.tournament_id = tournaments.id and e.user_id = (select auth.uid())
    )
  );

create policy "tournaments_insert_authenticated"
  on public.tournaments for insert
  to authenticated
  with check (created_by = (select auth.uid()));

create policy "tournaments_update_authenticated"
  on public.tournaments for update
  to authenticated
  using (true)
  with check (true);

create policy "tournament_entries_rw"
  on public.tournament_entries for all
  to authenticated
  using (true)
  with check (true);

create policy "tournament_matches_rw"
  on public.tournament_matches for all
  to authenticated
  using (true)
  with check (true);

grant select, insert, update, delete on public.tournaments to authenticated;
grant select, insert, update, delete on public.tournament_entries to authenticated;
grant select, insert, update, delete on public.tournament_matches to authenticated;
