-- ACCL rating bucket contract alignment (6-bucket model).
-- Final allowed buckets:
--   free_live, free_daily, free_correspondence,
--   tournament_live, tournament_daily, tournament_correspondence
--
-- This migration supersedes prior speed-class assumptions (bullet/blitz/rapid)
-- without deleting migration history.

do $$
begin
  if to_regclass('public.player_ratings') is null then
    return;
  end if;

  -- Drop old constraint first so remapped buckets can be inserted safely.
  alter table public.player_ratings
    drop constraint if exists player_ratings_bucket_check;

  -- Build a canonical row per (user, target_bucket) from both legacy + already-aligned rows.
  -- Legacy -> new mapping:
  --   free_bullet/blitz/rapid      -> free_live
  --   tournament_bullet/blitz/rapid-> tournament_live
  -- NOTE: `*_daily` is intentionally NOT remapped because the token exists in both
  -- legacy and final contracts; remapping blindly could corrupt already-aligned data.
  create temporary table _accl_bucket_migrated on commit drop as
  with normalized as (
    select
      pr.user_id,
      case pr.bucket
        when 'free_bullet' then 'free_live'
        when 'free_blitz' then 'free_live'
        when 'free_rapid' then 'free_live'
        when 'tournament_bullet' then 'tournament_live'
        when 'tournament_blitz' then 'tournament_live'
        when 'tournament_rapid' then 'tournament_live'
        when 'free_live' then 'free_live'
        when 'free_daily' then 'free_daily'
        when 'free_correspondence' then 'free_correspondence'
        when 'tournament_live' then 'tournament_live'
        when 'tournament_daily' then 'tournament_daily'
        when 'tournament_correspondence' then 'tournament_correspondence'
        else pr.bucket
      end as bucket,
      pr.rating,
      pr.games_played,
      pr.updated_at
    from public.player_ratings pr
  ),
  ranked as (
    select
      n.*,
      row_number() over (
        partition by n.user_id, n.bucket
        order by n.games_played desc, n.updated_at desc, n.rating desc
      ) as rn
    from normalized n
    where n.bucket in (
      'free_live',
      'free_daily',
      'free_correspondence',
      'tournament_live',
      'tournament_daily',
      'tournament_correspondence'
    )
  )
  select
    user_id,
    bucket,
    rating,
    games_played,
    updated_at
  from ranked
  where rn = 1;

  -- Rebuild rows to remove legacy/invalid bucket keys.
  delete from public.player_ratings;

  insert into public.player_ratings (user_id, bucket, rating, games_played, updated_at)
  select
    m.user_id,
    m.bucket,
    m.rating,
    m.games_played,
    coalesce(m.updated_at, now())
  from _accl_bucket_migrated m
  on conflict (user_id, bucket) do update
    set
      rating = excluded.rating,
      games_played = excluded.games_played,
      updated_at = excluded.updated_at;

  -- Ensure every profile has the full six-bucket set.
  insert into public.player_ratings (user_id, bucket, rating, games_played)
  select p.id, v.bucket, 1500, 0
  from public.profiles p
  cross join (
    values
      ('free_live'),
      ('free_daily'),
      ('free_correspondence'),
      ('tournament_live'),
      ('tournament_daily'),
      ('tournament_correspondence')
  ) as v(bucket)
  on conflict (user_id, bucket) do nothing;

  -- Replace bucket constraint with six-bucket contract.
  alter table public.player_ratings
    add constraint player_ratings_bucket_check check (
      bucket in (
        'free_live',
        'free_daily',
        'free_correspondence',
        'tournament_live',
        'tournament_daily',
        'tournament_correspondence'
      )
    );
end $$;

comment on table public.player_ratings is 'Per-user rating per ACCL six-bucket pace contract (live/daily/correspondence × free/tournament).';

comment on column public.player_ratings.bucket is
  'Allowed: free_live, free_daily, free_correspondence, tournament_live, tournament_daily, tournament_correspondence.';

-- New profiles: seed exactly six rows.
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
      ('tournament_correspondence')
  ) as v(bucket)
  on conflict (user_id, bucket) do nothing;
  return new;
end;
$$;

-- Classifier aligned to fixed six-bucket contract.
create or replace function public.classify_rating_bucket(
  p_play_context text,
  p_tempo text,
  p_live_time_control text
) returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  pref text;
  t text;
  lc text;
begin
  if lower(trim(coalesce(p_play_context, ''))) = 'tournament' then
    pref := 'tournament_';
  else
    pref := 'free_';
  end if;

  t := lower(trim(coalesce(p_tempo, '')));
  lc := lower(trim(coalesce(p_live_time_control, '')));

  if strpos(lc, '+') > 0 then
    return null;
  end if;

  if t = 'correspondence' or lc in ('1d', '2d', '3d') then
    return pref || 'correspondence';
  end if;

  if t = 'daily' then
    if lc <> '' and lc not in ('30m', '60m') then
      return null;
    end if;
    return pref || 'daily';
  end if;

  if t <> '' and t <> 'live' then
    return null;
  end if;

  if lc <> '' and lc not in ('1m', '3m', '5m', '10m', '30m', '60m') then
    return null;
  end if;

  return pref || 'live';
end;
$$;

comment on function public.classify_rating_bucket(text, text, text) is
  'Fixed ACCL pace bucket (live|daily|correspondence) × play context; invalid controls return NULL.';
