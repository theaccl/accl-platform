-- O1 — accl_overall bucket foundation + snapshot alias separation (Stage 1 post-BR1).
-- ACCL_O1_OVERALL_BUCKET_FOUNDATION
--
-- In scope:
--   - widen player_ratings.bucket CHECK to include accl_overall
--   - seed accl_overall rows from profiles only (1500 / 0 games)
--   - extend profile seed trigger for new profiles
--   - separate get_public_profile_snapshot accl_rating from tournament_unified
--
-- Out of scope (explicit):
--   - apply_free_play_rating_update_core changes (O2)
--   - ledger accl rows, games backfill, tournament_unified copy into accl_overall
--   - badge settlement activation, player_badge_state writes
--   - schema_migrations repair

begin;

-- ---------------------------------------------------------------------------
-- 1) Bucket constraint — add accl_overall
-- ---------------------------------------------------------------------------

alter table public.player_ratings
  drop constraint if exists player_ratings_bucket_check;

alter table public.player_ratings
  add constraint player_ratings_bucket_check check (
    bucket in (
      'free_live',
      'free_daily',
      'free_correspondence',
      'tournament_live',
      'tournament_daily',
      'tournament_correspondence',
      'free_bullet',
      'free_blitz',
      'free_rapid',
      'free_day',
      'tournament_unified',
      'accl_overall'
    )
  );

comment on column public.player_ratings.bucket is
  'Legacy six pace buckets, P1 mode buckets, tournament_unified, and O1 accl_overall (canonical ACCL Overall storage).';

-- ---------------------------------------------------------------------------
-- 2) Structural seed — profiles only; never overwrite existing accl_overall
-- ---------------------------------------------------------------------------

insert into public.player_ratings (user_id, bucket, rating, games_played)
select p.id, 'accl_overall', 1500, 0
from public.profiles p
where not exists (
  select 1
  from public.player_ratings pr
  where pr.user_id = p.id
    and pr.bucket = 'accl_overall'
);

-- ---------------------------------------------------------------------------
-- 3) New profiles receive accl_overall row at 1500 / 0
-- ---------------------------------------------------------------------------

create or replace function public.trg_profiles_seed_player_ratings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.player_ratings (user_id, bucket, rating, games_played)
  select new.id, v.bucket, 1500, 0
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
-- 4) Snapshot — accl_rating from accl_overall; tournament fields unchanged
-- ---------------------------------------------------------------------------

create or replace function public.get_public_profile_snapshot(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles%rowtype;
  out jsonb;
  v_accl int;
  v_tu int;
begin
  if p_profile_id is null then
    return null;
  end if;

  select *
    into p
  from public.profiles
  where id = p_profile_id;

  if not found then
    return null;
  end if;

  v_accl := (
    select pr.rating
    from public.player_ratings pr
    where pr.user_id = p_profile_id and pr.bucket = 'accl_overall'
    limit 1
  );

  v_tu := (
    select pr.rating
    from public.player_ratings pr
    where pr.user_id = p_profile_id and pr.bucket = 'tournament_unified'
    limit 1
  );

  out := jsonb_build_object(
    'profile', jsonb_build_object(
      'id', p.id,
      'username', nullif(trim(coalesce(p.username, '')), ''),
      'created_at', p.created_at,
      'bio', nullif(trim(coalesce(p.bio, '')), ''),
      'avatar_path', nullif(trim(coalesce(p.avatar_path, '')), ''),
      'flag', nullif(trim(coalesce(p.flag, '')), ''),
      'last_active_at', p.last_active_at,
      'games_played', coalesce(p.games_played, 0),
      'current_streak', coalesce(p.current_streak, 0),
      'highest_streak', coalesce(p.highest_streak, 0)
    ),
    'ratings', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'bucket', pr.bucket,
            'rating', pr.rating,
            'games_played', pr.games_played
          )
          order by pr.bucket
        )
        from public.player_ratings pr
        where pr.user_id = p_profile_id
      ),
      '[]'::jsonb
    ),
    'p1', jsonb_build_object(
      'accl_rating', v_accl,
      'accl_overall', (
        select jsonb_build_object(
          'rating', pr.rating,
          'games_played', pr.games_played
        )
        from public.player_ratings pr
        where pr.user_id = p_profile_id and pr.bucket = 'accl_overall'
      ),
      'tournament_rating', v_tu,
      'tournament_unified', (
        select jsonb_build_object(
          'rating', pr.rating,
          'games_played', pr.games_played
        )
        from public.player_ratings pr
        where pr.user_id = p_profile_id and pr.bucket = 'tournament_unified'
      ),
      'free_bullet', (
        select jsonb_build_object('rating', pr.rating, 'games_played', pr.games_played)
        from public.player_ratings pr
        where pr.user_id = p_profile_id and pr.bucket = 'free_bullet'
      ),
      'free_blitz', (
        select jsonb_build_object('rating', pr.rating, 'games_played', pr.games_played)
        from public.player_ratings pr
        where pr.user_id = p_profile_id and pr.bucket = 'free_blitz'
      ),
      'free_rapid', (
        select jsonb_build_object('rating', pr.rating, 'games_played', pr.games_played)
        from public.player_ratings pr
        where pr.user_id = p_profile_id and pr.bucket = 'free_rapid'
      ),
      'free_day', (
        select jsonb_build_object('rating', pr.rating, 'games_played', pr.games_played)
        from public.player_ratings pr
        where pr.user_id = p_profile_id and pr.bucket = 'free_day'
      )
    ),
    'trophies', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', tr.id,
            'title', tr.title,
            'category', tr.category,
            'date_awarded', tr.date_awarded,
            'source_game_id', tr.source_game_id,
            'source_tournament_id', tr.source_tournament_id,
            'placement', tr.placement,
            'level', tr.level,
            'description', tr.description
          )
          order by tr.date_awarded desc nulls last, tr.created_at desc
        )
        from public.trophy_records tr
        where tr.user_id = p_profile_id
      ),
      '[]'::jsonb
    ),
    'vault_relics', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', vr.id,
            'title', vr.title,
            'category', vr.category,
            'date_won', vr.date_won,
            'source_game_id', vr.source_game_id,
            'source_tournament_id', vr.source_tournament_id,
            'pace', vr.pace,
            'description', vr.description
          )
          order by vr.date_won desc nulls last, vr.created_at desc
        )
        from public.vault_relic_records vr
        where vr.user_id = p_profile_id
      ),
      '[]'::jsonb
    ),
    'prestige_frame', (
      select to_jsonb(pf) - 'id' - 'user_id' - 'created_at' - 'source_basis'
      from public.prestige_profile_frames pf
      where pf.user_id = p_profile_id
      order by pf.updated_at desc
      limit 1
    ),
    'finished_games_count', (
      select count(*)::int
      from public.games g
      where g.status = 'finished'
        and (g.white_player_id = p_profile_id or g.black_player_id = p_profile_id)
    )
  );

  return out;
end;
$$;

comment on function public.get_public_profile_snapshot(uuid) is
  'Privacy-safe public profile payload. O1: p1.accl_rating and p1.accl_overall sourced from accl_overall bucket; tournament fields tournament-only.';

-- ---------------------------------------------------------------------------
-- 5) O1 post-check — every profile has structural accl_overall seed row
-- ---------------------------------------------------------------------------

do $$
declare
  v_missing bigint;
begin
  select count(*)
    into v_missing
  from public.profiles p
  where not exists (
    select 1
    from public.player_ratings pr
    where pr.user_id = p.id
      and pr.bucket = 'accl_overall'
  );

  if v_missing > 0 then
    raise exception 'O1 post-check failed: % profiles missing accl_overall row', v_missing;
  end if;
end;
$$;

commit;
