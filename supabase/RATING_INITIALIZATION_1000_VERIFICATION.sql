-- ACCL rating initialization 1000 — verification pack (counts only, no PII).
-- Read-only. Safe to run before and after migration apply.
-- Requires service_role (helper EXECUTE is revoked from anon/authenticated).

\set ON_ERROR_STOP on

with
major_buckets as (
  select unnest(public.accl_rating_initialization_major_family_buckets()) as bucket
),
ordinary_profiles as (
  select p.id
  from public.profiles p
  where not public.accl_is_platform_bot_user_id(p.id)
),
accounts_with_games as (
  select distinct p.id
  from ordinary_profiles p
  where exists (
    select 1
    from public.games g
    where g.white_player_id = p.id or g.black_player_id = p.id
  )
),
accounts_with_tournament_entries as (
  select distinct te.user_id as id
  from public.tournament_entries te
  join ordinary_profiles p on p.id = te.user_id
),
accounts_with_ledger as (
  select distinct l.player_id as id
  from public.player_rating_history_ledger l
  join ordinary_profiles p on p.id = l.player_id
),
accounts_with_any_gp as (
  select distinct pr.user_id as id
  from public.player_ratings pr
  join ordinary_profiles p on p.id = pr.user_id
  where pr.games_played > 0
),
eligible_pre_apply as (
  select p.id
  from ordinary_profiles p
  where public.accl_is_zero_game_legacy_rating_seed_eligible(p.id)
),
excluded_mixed as (
  select distinct p.id
  from ordinary_profiles p
  where not public.accl_is_zero_game_legacy_rating_seed_eligible(p.id)
    and exists (
      select 1
      from public.player_ratings pr
      join major_buckets mb on mb.bucket = pr.bucket
      where pr.user_id = p.id
        and pr.games_played = 0
        and pr.rating = 1500
    )
    and not exists (select 1 from accounts_with_games g where g.id = p.id)
    and not exists (select 1 from accounts_with_ledger l where l.id = p.id)
),
excluded_bots as (
  select p.id
  from public.profiles p
  where public.accl_is_platform_bot_user_id(p.id)
),
zero_game_major_at_1000 as (
  select p.id
  from ordinary_profiles p
  where not exists (select 1 from accounts_with_games g where g.id = p.id)
    and not exists (select 1 from accounts_with_tournament_entries t where t.id = p.id)
    and not exists (select 1 from accounts_with_ledger l where l.id = p.id)
    and not exists (select 1 from accounts_with_any_gp gp where gp.id = p.id)
    and not public.accl_is_platform_bot_user_id(p.id)
    and not exists (
      select 1
      from major_buckets mb
      left join public.player_ratings pr
        on pr.user_id = p.id and pr.bucket = mb.bucket
      where pr.user_id is null
         or pr.rating <> 1000
         or pr.games_played <> 0
    )
),
partial_six_family as (
  select p.id
  from ordinary_profiles p
  cross join major_buckets mb
  left join public.player_ratings pr
    on pr.user_id = p.id and pr.bucket = mb.bucket
  group by p.id
  having count(*) filter (where pr.rating = 1000 and pr.games_played = 0)
       <> (select count(*) from major_buckets)
),
ineligible_changed as (
  select count(distinct pr.user_id) as cnt
  from public.player_ratings pr
  join major_buckets mb on mb.bucket = pr.bucket
  where pr.rating = 1000
    and pr.games_played = 0
    and (
      exists (select 1 from accounts_with_games g where g.id = pr.user_id)
      or exists (select 1 from accounts_with_tournament_entries t where t.id = pr.user_id)
      or exists (select 1 from accounts_with_ledger l where l.id = pr.user_id)
      or exists (select 1 from accounts_with_any_gp gp where gp.id = pr.user_id)
      or public.accl_is_platform_bot_user_id(pr.user_id)
    )
)
select 'ordinary_player_profiles' as metric, (select count(*) from ordinary_profiles)::bigint as value
union all
select 'accounts_with_any_game_participation', (select count(*) from accounts_with_games)
union all
select 'accounts_with_tournament_entries', (select count(*) from accounts_with_tournament_entries)
union all
select 'accounts_with_rating_ledger_activity', (select count(*) from accounts_with_ledger)
union all
select 'accounts_with_any_games_played_gt_zero', (select count(*) from accounts_with_any_gp)
union all
select 'conservatively_eligible_zero_game_accounts_pre_apply_predicate', (select count(*) from eligible_pre_apply)
union all
select 'excluded_legacy_1500_but_ineligible_mixed', (select count(*) from excluded_mixed)
union all
select 'excluded_platform_bot_profiles', (select count(*) from excluded_bots)
union all
select 'stable_zero_game_major_family_fully_at_1000_gp0', (select count(*) from zero_game_major_at_1000)
union all
select 'partial_six_family_correction_detected', (select count(*) from partial_six_family)
union all
select 'ineligible_accounts_whose_ratings_changed_must_be_zero', (select cnt from ineligible_changed)
union all
select 'legacy_1500_major_family_rows_remaining', (
  select count(*)
  from public.player_ratings pr
  join major_buckets mb on mb.bucket = pr.bucket
  where pr.rating = 1500 and pr.games_played = 0
)
order by metric;

-- Detailed bucket breakdown (major families)
select
  pr.bucket,
  count(*) as rows_total,
  count(*) filter (where pr.rating = 1000 and pr.games_played = 0) as at_1000_gp0,
  count(*) filter (where pr.rating = 1500 and pr.games_played = 0) as at_1500_gp0
from public.player_ratings pr
where pr.bucket = any (public.accl_rating_initialization_major_family_buckets())
group by pr.bucket
order by pr.bucket;
