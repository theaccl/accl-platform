-- ACCL verification candidate helpers
-- Purpose: suggest valid IDs for operator verification packs.
-- Run this first, then copy IDs into:
--   - VAULT_EMISSION_VERIFICATION.sql
--   - TROPHY_EMISSION_VERIFICATION.sql
--   - PRESTIGE_EMISSION_VERIFICATION.sql

-- ============================================================================
-- 1) Vault verification candidates
-- ============================================================================

-- 1A) Recent finished winner games (WIN_GAME_ID candidates)
select
  g.id as game_id,
  g.finished_at,
  g.result,
  g.winner_id,
  g.white_player_id,
  g.black_player_id,
  g.play_context,
  g.tempo
from public.games g
where g.status = 'finished'
  and (
    g.winner_id is not null
    or g.result in ('white_win', 'black_win')
  )
order by coalesce(g.finished_at, g.created_at) desc
limit 30;

-- 1B) Recent finished draw/no-winner games (DRAW_GAME_ID candidates)
select
  g.id as game_id,
  g.finished_at,
  g.result,
  g.winner_id,
  g.white_player_id,
  g.black_player_id,
  g.play_context,
  g.tempo
from public.games g
where g.status = 'finished'
  and g.winner_id is null
  and coalesce(g.result, '') in ('draw', '1/2-1/2')
order by coalesce(g.finished_at, g.created_at) desc
limit 30;

-- ============================================================================
-- 2) Trophy verification candidates
-- ============================================================================

-- 2A) Completed tournaments with champion (CHAMPION_TOURNAMENT_ID candidates)
select
  t.id as tournament_id,
  t.status,
  t.tempo,
  fm.id as final_match_id,
  fm.winner_id as champion_user_id,
  fm.game_id as final_game_id
from public.tournaments t
join lateral (
  select m.*
  from public.tournament_matches m
  where m.tournament_id = t.id
    and m.next_match_id is null
  order by m.round_number desc, m.match_number desc
  limit 1
) fm on true
where t.status = 'completed'
  and fm.winner_id is not null
order by t.created_at desc
limit 30;

-- 2B) Incomplete tournaments (INCOMPLETE_TOURNAMENT_ID candidates)
select
  t.id as tournament_id,
  t.status,
  t.tempo,
  t.created_at
from public.tournaments t
where t.status in ('pending', 'active')
order by t.created_at desc
limit 30;

-- 2C) Completed tournaments missing champion/final winner (NO_CHAMP_TOURNAMENT_ID candidates)
-- May return zero rows in healthy environments.
select
  t.id as tournament_id,
  t.status,
  t.tempo,
  fm.id as final_match_id,
  fm.winner_id as final_match_winner_id,
  fm.game_id as final_game_id
from public.tournaments t
left join lateral (
  select m.*
  from public.tournament_matches m
  where m.tournament_id = t.id
    and m.next_match_id is null
  order by m.round_number desc, m.match_number desc
  limit 1
) fm on true
where t.status = 'completed'
  and (fm.id is null or fm.winner_id is null)
order by t.created_at desc
limit 30;

-- ============================================================================
-- 3) Prestige verification candidates
-- ============================================================================

-- 3A) Users with at least one trophy (TROPHY_USER_ID candidates)
select
  p.id as user_id,
  p.email,
  count(tr.id) as trophy_count
from public.profiles p
join public.trophy_records tr on tr.user_id = p.id
group by p.id, p.email
order by count(tr.id) desc, p.id
limit 30;

-- 3B) Users with relic(s) but no trophies (RELIC_ONLY_USER_ID candidates)
select
  p.id as user_id,
  p.email,
  count(vr.id) as relic_count
from public.profiles p
join public.vault_relic_records vr on vr.user_id = p.id
left join public.trophy_records tr on tr.user_id = p.id
where tr.id is null
group by p.id, p.email
order by count(vr.id) desc, p.id
limit 30;

-- 3C) Users with neither trophies nor relics (EMPTY_USER_ID candidates)
select
  p.id as user_id,
  p.email
from public.profiles p
where not exists (select 1 from public.trophy_records tr where tr.user_id = p.id)
  and not exists (select 1 from public.vault_relic_records vr where vr.user_id = p.id)
order by p.created_at desc nulls last, p.id
limit 50;
