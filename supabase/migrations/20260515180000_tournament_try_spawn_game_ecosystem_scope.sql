-- T1-B: tournament bracket spawns must inherit tournaments.ecosystem_scope on games
-- (avoids K-12 tournament rows defaulting games to adult).

-- ---------------------------------------------------------------------------
-- Backfill: align historical tournament games with parent tournament scope
-- ---------------------------------------------------------------------------

update public.games g
set ecosystem_scope = t.ecosystem_scope
from public.tournaments t
where g.tournament_id = t.id
  and g.play_context = 'tournament'
  and g.ecosystem_scope is distinct from t.ecosystem_scope;

-- ---------------------------------------------------------------------------
-- Spawn: set ecosystem_scope from tournament row (matches games check constraint)
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
    ecosystem_scope,
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
    t.ecosystem_scope,
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

comment on function public.tournament_try_spawn_game(uuid) is
  'Spawns bracket game with ecosystem_scope from parent tournament (adult/k12 isolation).';
