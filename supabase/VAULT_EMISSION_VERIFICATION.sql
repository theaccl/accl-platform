-- ACCL Vault emission verification pack
-- Purpose: validate finish -> Vault winner hook behavior end-to-end in deployed DB.
-- This script is operator-facing and should be run from Supabase SQL Editor.
--
-- Required setup:
--   1) Pick ONE finished winner game id (WIN_GAME_ID)
--   2) Pick ONE finished draw/no-winner game id (DRAW_GAME_ID)
--   3) Ensure migrations for vault schema/orchestrator/emitter/hook are applied.
--
-- IMPORTANT:
-- - This pack does not change gameplay logic; it only triggers existing trusted emitter functions.
-- - Replace the UUID placeholders before running.

-- ============================================================================
-- 0) Inputs (replace before run)
-- ============================================================================
-- Winner game candidate
--   status='finished' and winner_id is not null OR result in ('white_win','black_win')
-- Draw/no-winner game candidate
--   status='finished' and winner_id is null and result in ('draw','1/2-1/2')

with inputs as (
  select
    '00000000-0000-0000-0000-000000000001'::uuid as win_game_id,
    '00000000-0000-0000-0000-000000000002'::uuid as draw_game_id
)
select * from inputs;

-- ============================================================================
-- 1) Preflight check: game eligibility snapshot
-- ============================================================================
with inputs as (
  select
    '00000000-0000-0000-0000-000000000001'::uuid as win_game_id,
    '00000000-0000-0000-0000-000000000002'::uuid as draw_game_id
)
select
  g.id,
  g.status,
  g.result,
  g.winner_id,
  g.white_player_id,
  g.black_player_id,
  g.play_context,
  g.tempo,
  g.finished_at
from public.games g
join inputs i on g.id in (i.win_game_id, i.draw_game_id)
order by g.id;

-- ============================================================================
-- 2) CASE A: winner game emits once
--    Expected:
--      - function returns {"issued": true, ...} on first call (or already_issued if previously emitted)
--      - exactly one relic row for milestone key game_finish:<game_id>:winner
--      - audit row recorded
-- ============================================================================
with inputs as (
  select '00000000-0000-0000-0000-000000000001'::uuid as win_game_id
)
select
  public.emit_vault_relic_for_finished_game_winner(i.win_game_id) as emission_outcome
from inputs i;

-- Inspect resulting relic(s) for winner milestone key
with inputs as (
  select '00000000-0000-0000-0000-000000000001'::uuid as win_game_id
)
select
  v.id,
  v.user_id,
  v.title,
  v.category,
  v.milestone_key,
  v.source_game_id,
  v.source_tournament_id,
  v.date_won,
  v.created_at
from public.vault_relic_records v
join inputs i on v.source_game_id = i.win_game_id
where v.milestone_key = format('game_finish:%s:winner', i.win_game_id::text)
order by v.created_at desc;

-- ============================================================================
-- 3) CASE B: retry is idempotent
--    Expected:
--      - second call returns {"issued": false, "reason":"already_issued", ...}
--      - relic count for milestone key remains 1
--      - audit shows repeat behavior
-- ============================================================================
with inputs as (
  select '00000000-0000-0000-0000-000000000001'::uuid as win_game_id
)
select
  public.emit_vault_relic_for_finished_game_winner(i.win_game_id) as emission_outcome_retry
from inputs i;

-- Count rows for winner milestone key (should remain 1)
with inputs as (
  select '00000000-0000-0000-0000-000000000001'::uuid as win_game_id
)
select
  count(*) as milestone_relic_row_count
from public.vault_relic_records v
join inputs i on v.source_game_id = i.win_game_id
where v.milestone_key = format('game_finish:%s:winner', i.win_game_id::text);

-- ============================================================================
-- 4) CASE C: draw/no-winner skips
--    Expected:
--      - function returns {"issued": false, "reason":"no_winner"} (or equivalent skip)
--      - no relic row with milestone key game_finish:<draw_game_id>:winner
--      - audit row with outcome='skipped'
-- ============================================================================
with inputs as (
  select '00000000-0000-0000-0000-000000000002'::uuid as draw_game_id
)
select
  public.emit_vault_relic_for_finished_game_winner(i.draw_game_id) as draw_emission_outcome
from inputs i;

with inputs as (
  select '00000000-0000-0000-0000-000000000002'::uuid as draw_game_id
)
select
  count(*) as draw_milestone_relic_row_count
from public.vault_relic_records v
join inputs i on v.source_game_id = i.draw_game_id
where v.milestone_key = format('game_finish:%s:winner', i.draw_game_id::text);

-- ============================================================================
-- 5) Audit visibility queries (issued/already_issued/skipped/error)
--    Use these to inspect failures and repeat behavior.
-- ============================================================================

-- Recent emitter outcomes by game
select
  a.created_at,
  a.emitter,
  a.outcome,
  a.user_id,
  a.milestone_key,
  a.source_game_id,
  a.source_tournament_id,
  a.details
from public.vault_relic_issuance_audit a
where a.emitter = 'emit_vault_relic_for_finished_game_winner'
order by a.created_at desc
limit 100;

-- Filter audit by specific game ids
with inputs as (
  select
    '00000000-0000-0000-0000-000000000001'::uuid as win_game_id,
    '00000000-0000-0000-0000-000000000002'::uuid as draw_game_id
)
select
  a.created_at,
  a.outcome,
  a.milestone_key,
  a.source_game_id,
  a.details
from public.vault_relic_issuance_audit a
join inputs i on a.source_game_id in (i.win_game_id, i.draw_game_id)
where a.emitter = 'emit_vault_relic_for_finished_game_winner'
order by a.created_at desc;

-- Optional: show latest errors only
select
  a.created_at,
  a.emitter,
  a.source_game_id,
  a.milestone_key,
  a.details
from public.vault_relic_issuance_audit a
where a.outcome = 'error'
order by a.created_at desc
limit 50;
