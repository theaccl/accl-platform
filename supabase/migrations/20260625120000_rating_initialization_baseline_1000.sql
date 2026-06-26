-- ACCL Stage 1 — new-player rating initialization baseline 1000.
-- ACCL_RATING_INITIALIZATION_1000_FROZEN
--
-- In scope:
--   - player_ratings column default 1000
--   - profiles trigger seeds all rating buckets at 1000 / 0 games
--   - apply_free_play_rating_update_core lazy-insert seeds at 1000 / 0
--   - conservative one-time correction: legacy untouched 1500 zero-game accounts → 1000
--     across the six major families only
--
-- Out of scope (explicit):
--   - Elo formulas, finish_game, O2 dual-write logic, ledger rewrite
--   - historical rating events, post-game updates, badge settlement activation
--   - players with any game participation or rating-history ledger activity
--   - bots / platform service identities
--
-- Transaction note:
--   Supabase CLI / psql migration runners execute this file in a single transaction.
--   Eligibility predicates are re-evaluated on every INSERT/UPDATE row target at write time.
--
-- Concurrency note:
--   Explicit SHARE ROW EXCLUSIVE table locks block concurrent INSERT/UPDATE/DELETE on
--   profiles, games, tournament_entries, player_rating_history_ledger, and player_ratings
--   for other transactions until this migration commits or rolls back. Ordinary reads remain
--   possible under those explicit locks.
--   ALTER TABLE player_ratings ALTER COLUMN rating SET DEFAULT 1000 may acquire ACCESS
--   EXCLUSIVE on player_ratings; reads of that table may therefore wait briefly until this
--   transaction completes. Profile creation, game/rating settlement, tournament registration,
--   and related writes may wait briefly; no permanent maintenance mode is introduced.
--   Production apply must be short, controlled, and separately authorized.

-- ---------------------------------------------------------------------------
-- 1) Conservative zero-game legacy correction helpers
-- ---------------------------------------------------------------------------

create or replace function public.accl_is_platform_bot_user_id(p_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select p_user_id in (
    '10000000-0000-0000-0000-000000000001'::uuid,
    '10000000-0000-0000-0000-000000000002'::uuid,
    '10000000-0000-0000-0000-000000000003'::uuid,
    '9bc30963-68d9-41b7-a442-b38c450301d2'::uuid
  );
$$;

comment on function public.accl_is_platform_bot_user_id(uuid) is
  'Fixed platform bot profile UUIDs excluded from ordinary-player rating seed correction.';

create or replace function public.accl_rating_initialization_major_family_buckets()
returns text[]
language sql
immutable
security invoker
set search_path = public
as $$
  select array[
    'accl_overall',
    'tournament_unified',
    'free_bullet',
    'free_blitz',
    'free_rapid',
    'free_day'
  ]::text[];
$$;

comment on function public.accl_rating_initialization_major_family_buckets() is
  'Six player-facing major rating families corrected by the 1000 seed migration.';

create or replace function public.accl_is_zero_game_legacy_rating_seed_eligible(p_user_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select
    p_user_id is not null
    and not public.accl_is_platform_bot_user_id(p_user_id)
    and exists (select 1 from public.profiles p where p.id = p_user_id)
    and not exists (
      select 1
      from public.games g
      where g.white_player_id = p_user_id
         or g.black_player_id = p_user_id
    )
    and not exists (
      select 1
      from public.tournament_entries te
      where te.user_id = p_user_id
    )
    and not exists (
      select 1
      from public.player_rating_history_ledger l
      where l.player_id = p_user_id
    )
    and not exists (
      select 1
      from public.player_ratings pr_any
      where pr_any.user_id = p_user_id
        and pr_any.games_played > 0
    )
    and not exists (
      select 1
      from public.player_ratings pr
      where pr.user_id = p_user_id
        and pr.bucket = any (public.accl_rating_initialization_major_family_buckets())
        and (pr.games_played <> 0 or pr.rating <> 1500)
    );
$$;

comment on function public.accl_is_zero_game_legacy_rating_seed_eligible(uuid) is
  'Conservative eligibility for one-time legacy 1500 → 1000 seed correction on zero-activity accounts.';

revoke all on function public.accl_is_platform_bot_user_id(uuid) from public;
revoke all on function public.accl_rating_initialization_major_family_buckets() from public;
revoke all on function public.accl_is_zero_game_legacy_rating_seed_eligible(uuid) from public;
revoke all on function public.accl_is_platform_bot_user_id(uuid) from anon;
revoke all on function public.accl_rating_initialization_major_family_buckets() from anon;
revoke all on function public.accl_is_zero_game_legacy_rating_seed_eligible(uuid) from anon;
revoke all on function public.accl_is_platform_bot_user_id(uuid) from authenticated;
revoke all on function public.accl_rating_initialization_major_family_buckets() from authenticated;
revoke all on function public.accl_is_zero_game_legacy_rating_seed_eligible(uuid) from authenticated;

grant execute on function public.accl_is_platform_bot_user_id(uuid) to service_role;
grant execute on function public.accl_rating_initialization_major_family_buckets() to service_role;
grant execute on function public.accl_is_zero_game_legacy_rating_seed_eligible(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 2) Concurrency guard — block participation/rating mutations during correction
-- ---------------------------------------------------------------------------

lock table
  public.profiles,
  public.games,
  public.tournament_entries,
  public.player_rating_history_ledger,
  public.player_ratings
in share row exclusive mode;

-- ---------------------------------------------------------------------------
-- 3) Column default
-- ---------------------------------------------------------------------------

alter table public.player_ratings
  alter column rating set default 1000;

-- ---------------------------------------------------------------------------
-- 4) New profile seed trigger — all buckets at 1000 / 0
-- ---------------------------------------------------------------------------

create or replace function public.trg_profiles_seed_player_ratings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.player_ratings (user_id, bucket, rating, games_played)
  select new.id, v.bucket, 1000, 0
  from (
    values
      ('free_live'),
      ('free_daily'),
      ('free_correspondence'),
      ('tournament_live'),
      ('tournament_daily'),
      ('tournament_correspondence'),
      ('free_bullet'),
      ('free_blitz'),
      ('free_rapid'),
      ('free_day'),
      ('tournament_unified'),
      ('accl_overall')
  ) as v(bucket)
  on conflict (user_id, bucket) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Lazy-insert seeds in apply_free_play_rating_update_core (O2 body)
-- ---------------------------------------------------------------------------

do $patch_apply$
declare
  v_def text;
  v_seed_literal constant text := ', 1500, 0)';
  v_new_literal constant text := ', 1000, 0)';
  v_expected_replacements constant int := 6;
  v_before_count int;
  v_after_count int;
begin
  if to_regprocedure('public.apply_free_play_rating_update_core(uuid)') is null then
    raise exception 'apply_free_play_rating_update_core(uuid) missing';
  end if;

  select pg_get_functiondef('public.apply_free_play_rating_update_core(uuid)'::regprocedure)
  into v_def;

  if v_def is null or length(v_def) = 0 then
    raise exception 'apply_free_play_rating_update_core(uuid) definition empty';
  end if;

  v_before_count := (
    length(v_def) - length(replace(v_def, v_seed_literal, ''))
  ) / length(v_seed_literal);

  if v_before_count = 0 then
    v_after_count := (
      length(v_def) - length(replace(v_def, v_new_literal, ''))
    ) / length(v_new_literal);

    if v_after_count <> v_expected_replacements then
      raise exception
        'apply_free_play_rating_update_core already patched but lazy-insert 1000 seed count mismatch (found %, expected %)',
        v_after_count,
        v_expected_replacements;
    end if;

    return;
  end if;

  if v_before_count <> v_expected_replacements then
    raise exception
      'apply_free_play_rating_update_core lazy-insert seed literal count mismatch (found %, expected %)',
      v_before_count,
      v_expected_replacements;
  end if;

  if position('v2_elo_free' in lower(v_def)) = 0 then
    raise exception
      'apply_free_play_rating_update_core missing v2_elo_free marker; refusing dynamic patch';
  end if;

  v_def := replace(v_def, v_seed_literal, v_new_literal);

  if position(v_seed_literal in v_def) > 0 then
    raise exception
      'apply_free_play_rating_update_core still contains 1500 lazy-insert seeds after patch';
  end if;

  v_after_count := (
    length(v_def) - length(replace(v_def, v_new_literal, ''))
  ) / length(v_new_literal);

  if v_after_count <> v_expected_replacements then
    raise exception
      'apply_free_play_rating_update_core lazy-insert seed literal count after patch mismatch (found %, expected %)',
      v_after_count,
      v_expected_replacements;
  end if;

  execute v_def;
end;
$patch_apply$;

-- ---------------------------------------------------------------------------
-- 6) Transaction-local snapshot + idempotent correction (major families only)
-- ---------------------------------------------------------------------------

create temp table accl_rating_init_major_before on commit drop as
select pr.user_id, pr.bucket, pr.rating, pr.games_played
from public.player_ratings pr
where pr.bucket = any (public.accl_rating_initialization_major_family_buckets());

create temp table accl_rating_init_correction_candidates on commit drop as
select p.id as user_id
from public.profiles p
where public.accl_is_zero_game_legacy_rating_seed_eligible(p.id);

insert into public.player_ratings (user_id, bucket, rating, games_played)
select e.user_id, req.bucket, 1000, 0
from accl_rating_init_correction_candidates e
cross join lateral unnest(public.accl_rating_initialization_major_family_buckets()) as req(bucket)
where not exists (
    select 1
    from public.player_ratings pr
    where pr.user_id = e.user_id
      and pr.bucket = req.bucket
  )
on conflict (user_id, bucket) do nothing;

update public.player_ratings pr
set rating = 1000
where pr.bucket = any (public.accl_rating_initialization_major_family_buckets())
  and pr.games_played = 0
  and pr.rating = 1500
  and exists (
    select 1
    from accl_rating_init_correction_candidates c
    where c.user_id = pr.user_id
  );

-- ---------------------------------------------------------------------------
-- 7) Post-check invariants (migration-time, idempotent re-run safe)
-- ---------------------------------------------------------------------------

do $post$
declare
  v_candidate_participation bigint;
  v_candidate_not_1000 bigint;
  v_ineligible_changed bigint;
  v_partial_family bigint;
  v_unexpected_correction bigint;
begin
  select count(*) into v_candidate_participation
  from accl_rating_init_correction_candidates c
  where exists (
      select 1
      from public.games g
      where g.white_player_id = c.user_id
         or g.black_player_id = c.user_id
    )
    or exists (
      select 1
      from public.tournament_entries te
      where te.user_id = c.user_id
    )
    or exists (
      select 1
      from public.player_rating_history_ledger l
      where l.player_id = c.user_id
    )
    or exists (
      select 1
      from public.player_ratings pr
      where pr.user_id = c.user_id
        and pr.games_played > 0
    );

  if v_candidate_participation > 0 then
    raise exception
      'rating_initialization_1000 post-check failed: % original candidates have participation after correction',
      v_candidate_participation;
  end if;

  select count(*) into v_candidate_not_1000
  from accl_rating_init_correction_candidates c
  where (
    select count(*)
    from unnest(public.accl_rating_initialization_major_family_buckets()) req(bucket)
    join public.player_ratings pr
      on pr.user_id = c.user_id
     and pr.bucket = req.bucket
    where pr.rating = 1000
      and pr.games_played = 0
  ) <> array_length(public.accl_rating_initialization_major_family_buckets(), 1);

  if v_candidate_not_1000 > 0 then
    raise exception
      'rating_initialization_1000 post-check failed: % correction-candidate accounts not fully at 1000/0',
      v_candidate_not_1000;
  end if;

  select count(*) into v_ineligible_changed
  from accl_rating_init_major_before b
  join public.player_ratings pr
    on pr.user_id = b.user_id
   and pr.bucket = b.bucket
  where b.user_id not in (select user_id from accl_rating_init_correction_candidates)
    and (
      pr.rating is distinct from b.rating
      or pr.games_played is distinct from b.games_played
    );

  if v_ineligible_changed > 0 then
    raise exception
      'rating_initialization_1000 post-check failed: % ineligible major-family rows changed',
      v_ineligible_changed;
  end if;

  select count(*) into v_unexpected_correction
  from accl_rating_init_major_before b
  join public.player_ratings pr
    on pr.user_id = b.user_id
   and pr.bucket = b.bucket
  where b.user_id not in (select user_id from accl_rating_init_correction_candidates)
    and b.rating = 1500
    and b.games_played = 0
    and pr.rating = 1000
    and pr.games_played = 0;

  if v_unexpected_correction > 0 then
    raise exception
      'rating_initialization_1000 post-check failed: % ineligible legacy 1500 rows moved to 1000',
      v_unexpected_correction;
  end if;

  select count(*) into v_partial_family
  from accl_rating_init_correction_candidates c
  where (
    select count(*)
    from unnest(public.accl_rating_initialization_major_family_buckets()) req(bucket)
    left join public.player_ratings pr
      on pr.user_id = c.user_id
     and pr.bucket = req.bucket
    where pr.user_id is null
       or pr.rating <> 1000
       or pr.games_played <> 0
  ) > 0;

  if v_partial_family > 0 then
    raise exception
      'rating_initialization_1000 post-check failed: % correction-candidate accounts missing a corrected major family',
      v_partial_family;
  end if;
end;
$post$;
