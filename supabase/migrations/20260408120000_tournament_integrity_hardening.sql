-- Pass #8b: tournament integrity — idempotency, spawn/advance guards, slot conflicts, RLS tighten.
-- Deferred: admin role, service-only match writes, tournament Elo at milestones.
--
-- Existing DB assumptions (apply migrations in order): `public.games` has columns used by
-- `tournament_try_spawn_game`: tournament_id, play_context (incl. 'tournament'), mode ('PIT'),
-- fen, turn, rated, tempo, live_time_control, source_type, status, white/black_player_id,
-- last_move_at, move_deadline_at, white_clock_ms, black_clock_ms. Rating triggers ignore
-- tournament-finishes for immediate Elo (classification deferred).

-- ---------------------------------------------------------------------------
-- Schema: one canonical game row per bracket match (when spawned)
-- ---------------------------------------------------------------------------

create unique index if not exists tournament_matches_game_id_unique
  on public.tournament_matches (game_id)
  where game_id is not null;

comment on index public.tournament_matches_game_id_unique is
  'Each spawned tournament game links to at most one bracket match (spawn idempotency).';

-- ---------------------------------------------------------------------------
-- Hardened tournament SQL (atomic semantics + status gates)
-- ---------------------------------------------------------------------------

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

  select * into t from public.tournaments where id = m.tournament_id for update;
  if not found then
    return;
  end if;

  if t.status is distinct from 'active' then
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

  update public.tournament_matches
  set game_id = gid
  where id = p_match_id
    and game_id is null
    and winner_id is null;
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
  n public.tournament_matches%rowtype;
  v_next uuid;
  v_slot text;
  v_loser uuid;
  v_tid uuid;
  v_round int;
  v_tstatus text;
  v_occ uuid;
  v_upd int;
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

  select status into v_tstatus from public.tournaments where id = m.tournament_id;
  if v_tstatus is distinct from 'active' then
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
    update public.tournaments
    set status = 'completed'
    where id = v_tid
      and status = 'active';
    return;
  end if;

  select * into n from public.tournament_matches where id = v_next for update;
  if not found then
    return;
  end if;

  if v_slot = 'player1' then
    v_occ := n.player1_id;
    if v_occ is not null and v_occ is distinct from p_winner then
      raise exception 'tournament_advance_invariant_violation: player1 slot on match % already holds another player', v_next;
    end if;
    update public.tournament_matches
    set player1_id = p_winner
    where id = v_next
      and (player1_id is null or player1_id = p_winner);
    get diagnostics v_upd = row_count;
    if v_upd <> 1 then
      raise exception 'tournament_advance_invariant_violation: expected to fill player1 on match %', v_next;
    end if;
  elsif v_slot = 'player2' then
    v_occ := n.player2_id;
    if v_occ is not null and v_occ is distinct from p_winner then
      raise exception 'tournament_advance_invariant_violation: player2 slot on match % already holds another player', v_next;
    end if;
    update public.tournament_matches
    set player2_id = p_winner
    where id = v_next
      and (player2_id is null or player2_id = p_winner);
    get diagnostics v_upd = row_count;
    if v_upd <> 1 then
      raise exception 'tournament_advance_invariant_violation: expected to fill player2 on match %', v_next;
    end if;
  else
    raise exception 'tournament_advance_invariant_violation: missing advance_winner_as on feeder match %', p_match_id;
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
  v_ts text;
begin
  select * into m from public.tournament_matches where id = p_match_id for update;
  if not found then
    return;
  end if;

  select status into v_ts from public.tournaments where id = m.tournament_id;
  if v_ts is distinct from 'active' then
    return;
  end if;

  if m.winner_id is not null or m.game_id is not null then
    return;
  end if;

  if m.player1_id is not null and m.player2_id is not null then
    perform public.tournament_try_spawn_game(p_match_id);
    return;
  end if;

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
  v_tstatus text;
begin
  select * into g from public.games where id = p_game_id;
  if not found then
    return;
  end if;
  if g.play_context is distinct from 'tournament' or g.tournament_id is null then
    return;
  end if;

  select status into v_tstatus from public.tournaments where id = g.tournament_id;
  if not found then
    return;
  end if;
  if v_tstatus is distinct from 'active' then
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
  v_status text;
begin
  select status into v_status from public.tournaments where id = p_tournament_id for update;
  if not found or v_status is distinct from 'active' then
    return;
  end if;

  for m in
    select * from public.tournament_matches
    where tournament_id = p_tournament_id and round_number = 1
    order by match_number
  loop
    perform public.tournament_process_bye_or_spawn(m.id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: replace permissive policies (foundation) with creator/participant scope
-- ---------------------------------------------------------------------------

drop policy if exists "tournament_entries_rw" on public.tournament_entries;
drop policy if exists "tournament_matches_rw" on public.tournament_matches;
drop policy if exists "tournaments_update_authenticated" on public.tournaments;

create policy "tournaments_update_creator"
  on public.tournaments for update
  to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

comment on policy "tournaments_update_creator" on public.tournaments is
  'Tournament status/format updates: creator only. SECURITY DEFINER SQL still completes brackets.';

-- Entries: read if you play or you created the event. Writes: creator only (avoids random joins to pending events).
create policy "tournament_entries_select_participant_or_creator"
  on public.tournament_entries
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.tournaments t
      where t.id = tournament_entries.tournament_id
        and t.created_by = (select auth.uid())
    )
  );

create policy "tournament_entries_insert_creator"
  on public.tournament_entries
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_entries.tournament_id
        and t.created_by = (select auth.uid())
    )
  );

create policy "tournament_entries_update_creator"
  on public.tournament_entries
  for update
  to authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_entries.tournament_id
        and t.created_by = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_entries.tournament_id
        and t.created_by = (select auth.uid())
    )
  );

create policy "tournament_entries_delete_creator"
  on public.tournament_entries
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_entries.tournament_id
        and t.created_by = (select auth.uid())
    )
  );

-- Matches: read if entrant or creator. Mutate structure only while creator controls pending/active bracket.
create policy "tournament_matches_select_participant_or_creator"
  on public.tournament_matches
  for select
  to authenticated
  using (
    exists (
      select 1 from public.tournament_entries e
      where e.tournament_id = tournament_matches.tournament_id
        and e.user_id = (select auth.uid())
    )
    or exists (
      select 1 from public.tournaments t
      where t.id = tournament_matches.tournament_id
        and t.created_by = (select auth.uid())
    )
  );

create policy "tournament_matches_insert_creator_pending"
  on public.tournament_matches
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_matches.tournament_id
        and t.created_by = (select auth.uid())
        and t.status = 'pending'
    )
  );

create policy "tournament_matches_update_creator_scheduled"
  on public.tournament_matches
  for update
  to authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_matches.tournament_id
        and t.created_by = (select auth.uid())
        and t.status in ('pending', 'active')
    )
  )
  with check (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_matches.tournament_id
        and t.created_by = (select auth.uid())
        and t.status in ('pending', 'active')
    )
  );

create policy "tournament_matches_delete_creator_pending"
  on public.tournament_matches
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_matches.tournament_id
        and t.created_by = (select auth.uid())
        and t.status = 'pending'
    )
  );

comment on policy "tournament_entries_insert_creator" on public.tournament_entries is
  'Self-serve registration deferred — only creator may add entries in this pass.';
