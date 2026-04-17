-- P1 ratings truth — T2 additive schema, T3 classifier, T4 backfill (legacy six-bucket rows retained).
-- Locked: ACCL Rating = tournament_unified for P1; free_day = UI "Daily" (legacy `free_daily` key unused for P1 rows).

-- ---------------------------------------------------------------------------
-- Widen bucket constraint (legacy 6 + P1 5)
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
      'tournament_unified'
    )
  );

comment on column public.player_ratings.bucket is
  'Legacy six pace buckets plus P1: free_bullet, free_blitz, free_rapid, free_day (Daily/calendar), tournament_unified.';

-- ---------------------------------------------------------------------------
-- P1 classifier — must match lib/p1RatingClassifier.ts
-- ---------------------------------------------------------------------------
create or replace function public.classify_p1_rating_bucket(
  p_play_context text,
  p_tempo text,
  p_live_time_control text
) returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  pc text;
  t text;
  lc text;
  m text[];
  inc1 int;
  inc2 int;
  mins int;
begin
  pc := lower(trim(coalesce(p_play_context, '')));
  if pc = 'tournament' then
    return 'tournament_unified';
  end if;

  t := lower(trim(coalesce(p_tempo, '')));
  lc := lower(trim(coalesce(p_live_time_control, '')));

  if t = 'correspondence' then
    return 'free_day';
  end if;

  if lc in ('1d', '2d', '3d') then
    return 'free_day';
  end if;

  m := regexp_match(lc, '^([0-9]+)\s*\+\s*([0-9]+)$');
  if m is not null then
    inc1 := m[1]::int;
    inc2 := m[2]::int;
    if inc1 = 1 and inc2 = 1 then
      return 'free_bullet';
    end if;
    if inc1 = 2 and inc2 = 1 then
      return 'free_bullet';
    end if;
    if inc1 = 3 and inc2 = 2 then
      return 'free_blitz';
    end if;
    if inc1 = 5 and inc2 = 5 then
      return 'free_blitz';
    end if;
    return null;
  end if;

  if lc ~ '^[0-9]+m$' then
    mins := (substring(lc from '^([0-9]+)m$'))::int;
    if mins = 1 then
      return 'free_bullet';
    end if;
    if mins in (3, 5) then
      return 'free_blitz';
    end if;
    if mins in (10, 15, 20, 30, 60) then
      return 'free_rapid';
    end if;
    return null;
  end if;

  if t = 'daily' then
    if lc in ('30m', '60m') then
      return 'free_rapid';
    end if;
    if lc in ('1d', '2d', '3d') then
      return 'free_day';
    end if;
    return null;
  end if;

  if t <> '' and t <> 'live' then
    return null;
  end if;

  if lc = '' then
    return 'free_blitz';
  end if;

  return null;
end;
$$;

comment on function public.classify_p1_rating_bucket(text, text, text) is
  'P1 free speed buckets + tournament_unified; parity with lib/p1RatingClassifier.ts.';

-- ---------------------------------------------------------------------------
-- Seed P1 rows for new profiles (additive to legacy six)
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
      ('tournament_unified')
  ) as v(bucket)
  on conflict (user_id, bucket) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- T4: insert P1 buckets for existing users, then backfill from legacy rows
-- ---------------------------------------------------------------------------
insert into public.player_ratings (user_id, bucket, rating, games_played)
select p.id, v.bucket, 1500, 0
from public.profiles p
cross join (
  values
    ('free_bullet'),
    ('free_blitz'),
    ('free_rapid'),
    ('free_day'),
    ('tournament_unified')
) as v(bucket)
on conflict (user_id, bucket) do nothing;

-- tournament_unified: weighted average by games_played; if all gp=0, max rating across tournament_* 
update public.player_ratings tu
set
  rating = sub.rating_out,
  games_played = sub.gp_out,
  updated_at = now()
from (
  select
    p.id as user_id,
    case
      when coalesce(tl.games_played, 0) + coalesce(td.games_played, 0) + coalesce(tc.games_played, 0) > 0 then
        round(
          (
            coalesce(tl.rating, 1500)::numeric * coalesce(tl.games_played, 0)
            + coalesce(td.rating, 1500)::numeric * coalesce(td.games_played, 0)
            + coalesce(tc.rating, 1500)::numeric * coalesce(tc.games_played, 0)
          )
          / nullif(
              coalesce(tl.games_played, 0) + coalesce(td.games_played, 0) + coalesce(tc.games_played, 0),
              0
            )
        )::int
      else
        greatest(
          coalesce(tl.rating, 1500),
          coalesce(td.rating, 1500),
          coalesce(tc.rating, 1500)
        )
    end as rating_out,
    coalesce(tl.games_played, 0) + coalesce(td.games_played, 0) + coalesce(tc.games_played, 0) as gp_out
  from public.profiles p
  left join public.player_ratings tl
    on tl.user_id = p.id and tl.bucket = 'tournament_live'
  left join public.player_ratings td
    on td.user_id = p.id and td.bucket = 'tournament_daily'
  left join public.player_ratings tc
    on tc.user_id = p.id and tc.bucket = 'tournament_correspondence'
) sub
where tu.user_id = sub.user_id
  and tu.bucket = 'tournament_unified';

-- free_live -> free_bullet, free_blitz, free_rapid (same rating; games_played split with remainder on rapid)
update public.player_ratings pr
set
  rating = l.rating,
  games_played = case pr.bucket
    when 'free_bullet' then l.games_played / 3
    when 'free_blitz' then l.games_played / 3
    else l.games_played - 2 * (l.games_played / 3)
  end,
  updated_at = now()
from public.player_ratings l
where l.bucket = 'free_live'
  and pr.user_id = l.user_id
  and pr.bucket in ('free_bullet', 'free_blitz', 'free_rapid');

-- free_correspondence -> free_day (calendar / Daily ladder)
update public.player_ratings pr
set
  rating = fc.rating,
  games_played = fc.games_played,
  updated_at = now()
from public.player_ratings fc
where fc.bucket = 'free_correspondence'
  and pr.user_id = fc.user_id
  and pr.bucket = 'free_day';

-- Legacy free_daily (30m/60m daily boards) -> merge into free_rapid by weighted average
update public.player_ratings pr
set
  rating = case
    when coalesce(pr.games_played, 0) + coalesce(od.games_played, 0) > 0 then
      round(
        (
          pr.rating::numeric * coalesce(pr.games_played, 0)
          + od.rating::numeric * coalesce(od.games_played, 0)
        )
        / (coalesce(pr.games_played, 0) + coalesce(od.games_played, 0))
      )::int
    else
      pr.rating
  end,
  games_played = coalesce(pr.games_played, 0) + coalesce(od.games_played, 0),
  updated_at = now()
from public.player_ratings od
where od.bucket = 'free_daily'
  and pr.user_id = od.user_id
  and pr.bucket = 'free_rapid';
