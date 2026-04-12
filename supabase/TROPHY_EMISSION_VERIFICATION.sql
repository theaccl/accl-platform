-- ACCL Trophy emission verification pack
-- Purpose: validate tournament champion trophy emitter end-to-end in deployed DB.
-- Run in Supabase SQL Editor after replacing UUID placeholders.
--
-- Required inputs:
--   CHAMPION_TOURNAMENT_ID   -> completed tournament with final-match winner
--   INCOMPLETE_TOURNAMENT_ID -> tournament not completed (or otherwise ineligible)
--   NO_CHAMP_TOURNAMENT_ID   -> completed tournament where final match winner is null (if available)
--
-- This pack does not alter tournament runtime logic; it only exercises existing trusted emitter paths.

-- ============================================================================
-- 0) Inputs (replace before run)
-- ============================================================================
with inputs as (
  select
    '00000000-0000-0000-0000-000000000011'::uuid as champion_tournament_id,
    '00000000-0000-0000-0000-000000000022'::uuid as incomplete_tournament_id,
    '00000000-0000-0000-0000-000000000033'::uuid as no_champ_tournament_id
)
select * from inputs;

-- ============================================================================
-- 1) Preflight eligibility snapshot
-- ============================================================================
with inputs as (
  select
    '00000000-0000-0000-0000-000000000011'::uuid as champion_tournament_id,
    '00000000-0000-0000-0000-000000000022'::uuid as incomplete_tournament_id,
    '00000000-0000-0000-0000-000000000033'::uuid as no_champ_tournament_id
),
targets as (
  select champion_tournament_id as tid from inputs
  union all
  select incomplete_tournament_id from inputs
  union all
  select no_champ_tournament_id from inputs
)
select
  t.id as tournament_id,
  t.status,
  t.tempo,
  fm.id as final_match_id,
  fm.winner_id as final_match_winner_id,
  fm.game_id as final_match_game_id
from public.tournaments t
join targets x on x.tid = t.id
left join lateral (
  select m.*
  from public.tournament_matches m
  where m.tournament_id = t.id
    and m.next_match_id is null
  order by m.round_number desc, m.match_number desc
  limit 1
) fm on true
order by t.id;

-- ============================================================================
-- 2) CASE A: champion tournament emits once
--    Expected:
--      - first call returns issued:true (or already_issued if previously emitted)
--      - one trophy row with milestone key tournament_complete:<tid>:champion
--      - audit row(s) visible
-- ============================================================================
with inputs as (
  select '00000000-0000-0000-0000-000000000011'::uuid as champion_tournament_id
)
select
  public.emit_trophy_for_tournament_champion(i.champion_tournament_id) as emitter_outcome
from inputs i;

with inputs as (
  select '00000000-0000-0000-0000-000000000011'::uuid as champion_tournament_id
)
select
  tr.id,
  tr.user_id,
  tr.title,
  tr.category,
  tr.placement,
  tr.level,
  tr.milestone_key,
  tr.source_tournament_id,
  tr.source_game_id,
  tr.date_awarded,
  tr.created_at
from public.trophy_records tr
join inputs i on tr.source_tournament_id = i.champion_tournament_id
where tr.milestone_key = format('tournament_complete:%s:champion', i.champion_tournament_id::text)
order by tr.created_at desc;

-- ============================================================================
-- 3) CASE B: retry is idempotent
--    Expected:
--      - second call returns issued:false with reason already_issued
--      - row count for milestone key remains 1
--      - audit shows repeat behavior
-- ============================================================================
with inputs as (
  select '00000000-0000-0000-0000-000000000011'::uuid as champion_tournament_id
)
select
  public.emit_trophy_for_tournament_champion(i.champion_tournament_id) as emitter_outcome_retry
from inputs i;

with inputs as (
  select '00000000-0000-0000-0000-000000000011'::uuid as champion_tournament_id
)
select
  count(*) as champion_milestone_trophy_row_count
from public.trophy_records tr
join inputs i on tr.source_tournament_id = i.champion_tournament_id
where tr.milestone_key = format('tournament_complete:%s:champion', i.champion_tournament_id::text);

-- ============================================================================
-- 4) CASE C1: incomplete tournament skips
--    Expected:
--      - issued:false with reason tournament_not_completed
--      - no milestone trophy row
--      - audit outcome skipped
-- ============================================================================
with inputs as (
  select '00000000-0000-0000-0000-000000000022'::uuid as incomplete_tournament_id
)
select
  public.emit_trophy_for_tournament_champion(i.incomplete_tournament_id) as incomplete_outcome
from inputs i;

with inputs as (
  select '00000000-0000-0000-0000-000000000022'::uuid as incomplete_tournament_id
)
select
  count(*) as incomplete_milestone_trophy_row_count
from public.trophy_records tr
join inputs i on tr.source_tournament_id = i.incomplete_tournament_id
where tr.milestone_key = format('tournament_complete:%s:champion', i.incomplete_tournament_id::text);

-- ============================================================================
-- 5) CASE C2: completed but missing champion skips (if such sample exists)
--    Expected:
--      - issued:false with reason champion_missing (or final_match_missing)
--      - no milestone trophy row
--      - audit outcome skipped
-- ============================================================================
with inputs as (
  select '00000000-0000-0000-0000-000000000033'::uuid as no_champ_tournament_id
)
select
  public.emit_trophy_for_tournament_champion(i.no_champ_tournament_id) as no_champion_outcome
from inputs i;

with inputs as (
  select '00000000-0000-0000-0000-000000000033'::uuid as no_champ_tournament_id
)
select
  count(*) as no_champion_milestone_trophy_row_count
from public.trophy_records tr
join inputs i on tr.source_tournament_id = i.no_champ_tournament_id
where tr.milestone_key = format('tournament_complete:%s:champion', i.no_champ_tournament_id::text);

-- ============================================================================
-- 6) Audit visibility queries
--    Inspect issued/already_issued/skipped/error details.
-- ============================================================================
select
  a.created_at,
  a.emitter,
  a.outcome,
  a.user_id,
  a.milestone_key,
  a.source_tournament_id,
  a.source_game_id,
  a.details
from public.trophy_issuance_audit a
where a.emitter in ('emit_trophy_for_tournament_champion', 'orchestrate_trophy_issuance')
order by a.created_at desc
limit 150;

with inputs as (
  select
    '00000000-0000-0000-0000-000000000011'::uuid as champion_tournament_id,
    '00000000-0000-0000-0000-000000000022'::uuid as incomplete_tournament_id,
    '00000000-0000-0000-0000-000000000033'::uuid as no_champ_tournament_id
)
select
  a.created_at,
  a.emitter,
  a.outcome,
  a.milestone_key,
  a.source_tournament_id,
  a.details
from public.trophy_issuance_audit a
join inputs i on a.source_tournament_id in (
  i.champion_tournament_id,
  i.incomplete_tournament_id,
  i.no_champ_tournament_id
)
order by a.created_at desc;

-- Errors only
select
  a.created_at,
  a.emitter,
  a.source_tournament_id,
  a.milestone_key,
  a.details
from public.trophy_issuance_audit a
where a.outcome = 'error'
order by a.created_at desc
limit 50;
