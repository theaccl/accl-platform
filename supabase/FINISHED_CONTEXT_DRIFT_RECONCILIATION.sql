-- ACCL finished-game play_context drift reconciliation pack
-- Purpose:
--   - Identify finished rows with missing/invalid play_context
--   - Surface classification signals for safe manual reconciliation
--   - Provide guarded update templates (operator-reviewed, not blind rewrites)
--
-- IMPORTANT:
--   - Review candidate rows before any UPDATE.
--   - Prefer small, auditable batches with transaction + rollback option.

-- ============================================================================
-- 0) Drift count overview (finished rows only)
-- ============================================================================
select
  count(*)::int as finished_total,
  count(*) filter (where trim(coalesce(g.play_context, '')) = '')::int as missing_context_count,
  count(*) filter (
    where trim(coalesce(g.play_context, '')) <> ''
      and lower(trim(g.play_context)) not in ('free', 'tournament')
  )::int as invalid_context_count
from public.games g
where g.status = 'finished';

-- Context distribution for finished rows
select
  case
    when trim(coalesce(g.play_context, '')) = '' then 'MISSING'
    when lower(trim(g.play_context)) in ('free', 'tournament') then lower(trim(g.play_context))
    else 'INVALID:' || trim(g.play_context)
  end as context_bucket,
  count(*)::int as row_count
from public.games g
where g.status = 'finished'
group by 1
order by row_count desc, context_bucket;

-- ============================================================================
-- 1) Drift candidate details + classification signals
--    These are rows likely excluded from /finished free/tournament split.
-- ============================================================================
with drift as (
  select
    g.id,
    g.created_at,
    g.finished_at,
    g.play_context,
    g.tournament_id,
    g.source_type,
    g.mode,
    g.tempo,
    g.live_time_control,
    g.white_player_id,
    g.black_player_id,
    g.result,
    g.end_reason,
    case
      when g.tournament_id is not null then 'strong_tournament'
      when lower(trim(coalesce(g.source_type, ''))) in ('tournament_bracket', 'tournament') then 'strong_tournament'
      when g.mode = 'PIT' then 'possible_tournament'
      when lower(trim(coalesce(g.play_context, ''))) = 'free' then 'free'
      when lower(trim(coalesce(g.play_context, ''))) = 'tournament' then 'tournament'
      else 'unknown'
    end as inferred_context_signal
  from public.games g
  where g.status = 'finished'
    and (
      trim(coalesce(g.play_context, '')) = ''
      or lower(trim(g.play_context)) not in ('free', 'tournament')
    )
)
select *
from drift
order by coalesce(finished_at, created_at) desc
limit 200;

-- ============================================================================
-- 2) Potential contradiction checks (optional)
--    These rows are not drift by null/invalid, but their context may conflict with tournament signals.
-- ============================================================================

-- 2A) Marked free but has tournament linkage signals
select
  g.id,
  g.finished_at,
  g.play_context,
  g.tournament_id,
  g.source_type,
  g.mode
from public.games g
where g.status = 'finished'
  and lower(trim(coalesce(g.play_context, ''))) = 'free'
  and (
    g.tournament_id is not null
    or lower(trim(coalesce(g.source_type, ''))) in ('tournament_bracket', 'tournament')
    or g.mode = 'PIT'
  )
order by coalesce(g.finished_at, g.created_at) desc
limit 200;

-- 2B) Marked tournament but missing all obvious tournament linkage signals
select
  g.id,
  g.finished_at,
  g.play_context,
  g.tournament_id,
  g.source_type,
  g.mode
from public.games g
where g.status = 'finished'
  and lower(trim(coalesce(g.play_context, ''))) = 'tournament'
  and g.tournament_id is null
  and lower(trim(coalesce(g.source_type, ''))) not in ('tournament_bracket', 'tournament')
  and g.mode is distinct from 'PIT'
order by coalesce(g.finished_at, g.created_at) desc
limit 200;

-- ============================================================================
-- 3) Candidate IDs for controlled repair batches
-- ============================================================================

-- 3A) Strong tournament signals among drift rows
with drift as (
  select g.*
  from public.games g
  where g.status = 'finished'
    and (
      trim(coalesce(g.play_context, '')) = ''
      or lower(trim(g.play_context)) not in ('free', 'tournament')
    )
)
select
  d.id as game_id,
  d.finished_at,
  d.play_context as current_play_context,
  d.tournament_id,
  d.source_type,
  d.mode
from drift d
where d.tournament_id is not null
   or lower(trim(coalesce(d.source_type, ''))) in ('tournament_bracket', 'tournament')
order by coalesce(d.finished_at, d.created_at) desc
limit 200;

-- 3B) Likely free candidates among drift rows (no tournament signals)
with drift as (
  select g.*
  from public.games g
  where g.status = 'finished'
    and (
      trim(coalesce(g.play_context, '')) = ''
      or lower(trim(g.play_context)) not in ('free', 'tournament')
    )
)
select
  d.id as game_id,
  d.finished_at,
  d.play_context as current_play_context,
  d.tournament_id,
  d.source_type,
  d.mode
from drift d
where d.tournament_id is null
  and lower(trim(coalesce(d.source_type, ''))) not in ('tournament_bracket', 'tournament')
  and d.mode is distinct from 'PIT'
order by coalesce(d.finished_at, d.created_at) desc
limit 200;

-- ============================================================================
-- 4) Guarded update templates (manual, copy/edit IDs first)
--    Use explicit UUID lists from section 3; do NOT run broad predicates directly.
-- ============================================================================

-- Template A: set selected rows to tournament
-- begin;
-- update public.games g
-- set play_context = 'tournament'
-- where g.status = 'finished'
--   and g.id in (
--     '00000000-0000-0000-0000-000000000001'::uuid
--   )
-- returning g.id, g.play_context, g.tournament_id, g.source_type, g.mode, g.finished_at;
-- -- review output before commit
-- rollback; -- replace with commit when verified

-- Template B: set selected rows to free
-- begin;
-- update public.games g
-- set play_context = 'free'
-- where g.status = 'finished'
--   and g.id in (
--     '00000000-0000-0000-0000-000000000002'::uuid
--   )
-- returning g.id, g.play_context, g.tournament_id, g.source_type, g.mode, g.finished_at;
-- -- review output before commit
-- rollback; -- replace with commit when verified

-- ============================================================================
-- 5) Post-fix verification checks
-- ============================================================================
select
  count(*)::int as remaining_drift_rows
from public.games g
where g.status = 'finished'
  and (
    trim(coalesce(g.play_context, '')) = ''
    or lower(trim(g.play_context)) not in ('free', 'tournament')
  );

select
  count(*) filter (where lower(trim(coalesce(g.play_context, ''))) = 'free')::int as finished_free_rows,
  count(*) filter (where lower(trim(coalesce(g.play_context, ''))) = 'tournament')::int as finished_tournament_rows
from public.games g
where g.status = 'finished';
