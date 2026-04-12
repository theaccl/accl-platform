-- ACCL Prestige emission verification pack
-- Purpose: validate prestige foundation emitter end-to-end in deployed DB.
-- Run in Supabase SQL Editor after replacing UUID placeholders.
--
-- Required inputs:
--   TROPHY_USER_ID     -> user with >=1 trophy record
--   RELIC_ONLY_USER_ID -> user with 0 trophies and >=1 vault relic record
--   EMPTY_USER_ID      -> user with 0 trophies and 0 relics
--
-- This pack only exercises existing trusted emitter/orchestrator paths.

-- ============================================================================
-- 0) Inputs (replace before run)
-- ============================================================================
with inputs as (
  select
    '00000000-0000-0000-0000-000000000111'::uuid as trophy_user_id,
    '00000000-0000-0000-0000-000000000222'::uuid as relic_only_user_id,
    '00000000-0000-0000-0000-000000000333'::uuid as empty_user_id
)
select * from inputs;

-- ============================================================================
-- 1) Preflight source-truth snapshot
-- ============================================================================
with inputs as (
  select
    '00000000-0000-0000-0000-000000000111'::uuid as trophy_user_id,
    '00000000-0000-0000-0000-000000000222'::uuid as relic_only_user_id,
    '00000000-0000-0000-0000-000000000333'::uuid as empty_user_id
),
uids as (
  select trophy_user_id as uid from inputs
  union all
  select relic_only_user_id from inputs
  union all
  select empty_user_id from inputs
)
select
  u.uid as user_id,
  (select count(*) from public.trophy_records tr where tr.user_id = u.uid) as trophy_count,
  (select count(*) from public.vault_relic_records vr where vr.user_id = u.uid) as relic_count,
  (select max(pr.rating) from public.player_ratings pr where pr.user_id = u.uid) as max_rating
from uids u;

-- ============================================================================
-- 2) CASE A: trophy path updates
--    Expected:
--      - emitter returns updated:true (or unchanged on repeat)
--      - frame fields map to trophy-derived state (Honors Frame / laurel / bronze)
--      - source_basis evidence present with rule_version foundation_v1
-- ============================================================================
with inputs as (
  select '00000000-0000-0000-0000-000000000111'::uuid as trophy_user_id
)
select
  public.emit_prestige_profile_frame_foundation(i.trophy_user_id) as trophy_path_outcome
from inputs i;

with inputs as (
  select '00000000-0000-0000-0000-000000000111'::uuid as trophy_user_id
)
select
  pf.user_id,
  pf.current_tier,
  pf.frame_name,
  pf.motif_family,
  pf.accent_tier,
  pf.updated_at,
  pf.source_basis
from public.prestige_profile_frames pf
join inputs i on pf.user_id = i.trophy_user_id;

-- ============================================================================
-- 3) CASE B: relic-only path updates
--    Expected:
--      - emitter returns updated:true (or unchanged on repeat)
--      - frame fields map to relic-derived state (Relic Frame / sigil / iron)
-- ============================================================================
with inputs as (
  select '00000000-0000-0000-0000-000000000222'::uuid as relic_only_user_id
)
select
  public.emit_prestige_profile_frame_foundation(i.relic_only_user_id) as relic_path_outcome
from inputs i;

with inputs as (
  select '00000000-0000-0000-0000-000000000222'::uuid as relic_only_user_id
)
select
  pf.user_id,
  pf.current_tier,
  pf.frame_name,
  pf.motif_family,
  pf.accent_tier,
  pf.updated_at,
  pf.source_basis
from public.prestige_profile_frames pf
join inputs i on pf.user_id = i.relic_only_user_id;

-- ============================================================================
-- 4) CASE C: no-unlock skip path
--    Expected:
--      - emitter returns updated:false, reason no_unlock_signal
--      - no frame row created/changed for EMPTY_USER_ID
--      - audit visibility exists
-- ============================================================================
with inputs as (
  select '00000000-0000-0000-0000-000000000333'::uuid as empty_user_id
)
select
  public.emit_prestige_profile_frame_foundation(i.empty_user_id) as empty_path_outcome
from inputs i;

with inputs as (
  select '00000000-0000-0000-0000-000000000333'::uuid as empty_user_id
)
select
  count(*) as empty_user_frame_row_count
from public.prestige_profile_frames pf
join inputs i on pf.user_id = i.empty_user_id;

-- ============================================================================
-- 5) CASE D: repeat call unchanged path
--    Expected:
--      - second call for same user with unchanged source truth returns unchanged
--      - frame updated_at does not advance for identical computed state
-- ============================================================================
with inputs as (
  select '00000000-0000-0000-0000-000000000111'::uuid as trophy_user_id
),
before_row as (
  select pf.updated_at
  from public.prestige_profile_frames pf
  join inputs i on pf.user_id = i.trophy_user_id
),
call_result as (
  select public.emit_prestige_profile_frame_foundation((select trophy_user_id from inputs)) as outcome
),
after_row as (
  select pf.updated_at
  from public.prestige_profile_frames pf
  join inputs i on pf.user_id = i.trophy_user_id
)
select
  (select outcome from call_result) as repeat_outcome,
  (select updated_at from before_row) as updated_at_before,
  (select updated_at from after_row) as updated_at_after;

-- ============================================================================
-- 6) Audit visibility / error inspection
-- ============================================================================
select
  a.created_at,
  a.emitter,
  a.user_id,
  a.outcome,
  a.details
from public.prestige_state_audit a
where a.emitter in ('emit_prestige_profile_frame_foundation', 'orchestrate_prestige_profile_frame')
order by a.created_at desc
limit 200;

-- Filter by target users + source_basis rule version when present
with inputs as (
  select
    '00000000-0000-0000-0000-000000000111'::uuid as trophy_user_id,
    '00000000-0000-0000-0000-000000000222'::uuid as relic_only_user_id,
    '00000000-0000-0000-0000-000000000333'::uuid as empty_user_id
)
select
  a.created_at,
  a.emitter,
  a.user_id,
  a.outcome,
  a.details->>'reason' as reason,
  coalesce(
    a.details->'source_basis'->>'rule_version',
    a.details->'details'->'source_basis'->>'rule_version'
  ) as source_basis_rule_version
from public.prestige_state_audit a
join inputs i on a.user_id in (i.trophy_user_id, i.relic_only_user_id, i.empty_user_id)
order by a.created_at desc;

-- Errors only
select
  a.created_at,
  a.emitter,
  a.user_id,
  a.details
from public.prestige_state_audit a
where a.outcome = 'error'
order by a.created_at desc
limit 50;
