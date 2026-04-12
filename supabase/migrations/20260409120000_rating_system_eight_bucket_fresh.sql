-- Greenfield ACCL rating system: eight speed-class buckets only (no legacy bucket strings).
-- Mirrors lib/ratingBucketClassify.ts for classify_rating_bucket.

-- ---------------------------------------------------------------------------
-- player_ratings
-- ---------------------------------------------------------------------------
create table if not exists public.player_ratings (
  user_id uuid not null references public.profiles (id) on delete cascade,
  bucket text not null
    constraint player_ratings_bucket_check check (
      bucket in (
        'free_bullet',
        'free_blitz',
        'free_rapid',
        'free_daily',
        'tournament_bullet',
        'tournament_blitz',
        'tournament_rapid',
        'tournament_daily'
      )
    ),
  rating integer not null default 1500
    constraint player_ratings_rating_reasonable check (rating between 100 and 4000),
  games_played integer not null default 0
    constraint player_ratings_games_nonnegative check (games_played >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, bucket)
);

comment on table public.player_ratings is 'Per-user rating per ACCL speed-class bucket.';
comment on column public.player_ratings.bucket is 'free_* = casual; tournament_* = bracket (per-game apply deferred for tournament).';

create index if not exists player_ratings_bucket_idx on public.player_ratings (bucket);

alter table public.player_ratings enable row level security;

drop policy if exists "player_ratings_select_own" on public.player_ratings;

create policy "player_ratings_select_own"
  on public.player_ratings for select
  to authenticated
  using (auth.uid() = user_id);

grant select on public.player_ratings to authenticated;

-- ---------------------------------------------------------------------------
-- Seed: all eight buckets × every profile
-- ---------------------------------------------------------------------------
insert into public.player_ratings (user_id, bucket, rating, games_played)
select p.id, v.bucket, 1500, 0
from public.profiles p
cross join (
  values
    ('free_bullet'),
    ('free_blitz'),
    ('free_rapid'),
    ('free_daily'),
    ('tournament_bullet'),
    ('tournament_blitz'),
    ('tournament_rapid'),
    ('tournament_daily')
) as v(bucket)
on conflict (user_id, bucket) do nothing;

-- New profiles after deploy: same eight rows (idempotent).
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
      ('free_bullet'),
      ('free_blitz'),
      ('free_rapid'),
      ('free_daily'),
      ('tournament_bullet'),
      ('tournament_blitz'),
      ('tournament_rapid'),
      ('tournament_daily')
  ) as v(bucket)
  on conflict (user_id, bucket) do nothing;
  return new;
end;
$$;

drop trigger if exists profiles_seed_player_ratings on public.profiles;

create trigger profiles_seed_player_ratings
  after insert on public.profiles
  for each row
  execute function public.trg_profiles_seed_player_ratings();

-- ---------------------------------------------------------------------------
-- Classification (contract order; INVALID → NULL)
-- ---------------------------------------------------------------------------
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
  suffix text;
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

  if t = 'correspondence' then
    if lc = '' then
      lc := '1d';
    end if;
    if lc in ('1d', '2d', '3d') then
      return pref || 'daily';
    end if;
    return null;
  end if;

  if lc in ('1d', '2d', '3d') then
    return pref || 'daily';
  end if;

  if t = 'daily' then
    if lc = '' then
      lc := '30m';
    end if;
    if lc in ('30m', '60m') then
      return pref || 'rapid';
    end if;
    return null;
  end if;

  if lc = '' then
    lc := '5m';
  end if;
  if lc not in ('1m', '3m', '5m', '10m', '30m', '60m') then
    return null;
  end if;

  if lc = '1m' then
    suffix := 'bullet';
  elsif lc in ('3m', '5m') then
    suffix := 'blitz';
  else
    suffix := 'rapid';
  end if;

  return pref || suffix;
end;
$$;

comment on function public.classify_rating_bucket(text, text, text) is
  'Speed-class bucket (bullet|blitz|rapid|daily) × play context. Mirrors lib/ratingBucketClassify.ts.';

-- ---------------------------------------------------------------------------
-- Free-play rating apply (classified bucket only; INVALID → no rating_applied)
-- ---------------------------------------------------------------------------
create or replace function public.apply_free_play_rating_update_core(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.games%rowtype;
  v_bucket text;
  w_before int;
  b_before int;
  w_delta int := 0;
  b_delta int := 0;
  w_after int;
  b_after int;
  w_gp int;
  b_gp int;
  ctx text;
  out jsonb;
  v_games_updated int;
begin
  select * into r from public.games where id = p_game_id for update;
  if not found then
    return jsonb_build_object('applied', false, 'reason', 'game_not_found');
  end if;

  if r.status <> 'finished' then
    return jsonb_build_object('applied', false, 'reason', 'not_finished');
  end if;

  if coalesce(r.rating_applied, false) then
    return coalesce(
      r.rating_last_update,
      '{}'::jsonb
    ) || jsonb_build_object(
      'applied', false,
      'reason', 'already_applied'
    );
  end if;

  ctx := lower(trim(coalesce(r.play_context, 'free')));
  if ctx = '' then
    ctx := 'free';
  end if;
  if ctx = 'tournament' then
    return jsonb_build_object(
      'applied', false,
      'reason', 'tournament_deferred',
      'bucket', null
    );
  end if;
  if ctx <> 'free' then
    return jsonb_build_object('applied', false, 'reason', 'not_free_play');
  end if;

  if r.rated is not true then
    return jsonb_build_object(
      'applied', false,
      'reason', 'unrated',
      'bucket', null
    );
  end if;

  if r.white_player_id is null
     or r.black_player_id is null
     or r.white_player_id = r.black_player_id then
    return jsonb_build_object('applied', false, 'reason', 'not_both_seated');
  end if;

  v_bucket := public.classify_rating_bucket(
    coalesce(r.play_context, 'free'),
    r.tempo,
    r.live_time_control
  );

  if v_bucket is null then
    return jsonb_build_object(
      'applied', false,
      'reason', 'invalid_time_control',
      'bucket', null
    );
  end if;

  if r.result in ('draw', '1/2-1/2') then
    w_delta := 0;
    b_delta := 0;
  elsif r.result = 'white_win' or r.winner_id = r.white_player_id then
    w_delta := 10;
    b_delta := -10;
  elsif r.result = 'black_win' or r.winner_id = r.black_player_id then
    w_delta := -10;
    b_delta := 10;
  else
    return jsonb_build_object(
      'applied', false,
      'reason', 'unknown_result',
      'bucket', v_bucket
    );
  end if;

  insert into public.player_ratings (user_id, bucket, rating, games_played)
  values (r.white_player_id, v_bucket, 1500, 0)
  on conflict (user_id, bucket) do nothing;
  insert into public.player_ratings (user_id, bucket, rating, games_played)
  values (r.black_player_id, v_bucket, 1500, 0)
  on conflict (user_id, bucket) do nothing;

  select rating, games_played into w_before, w_gp
  from public.player_ratings
  where user_id = r.white_player_id and bucket = v_bucket
  for update;
  select rating, games_played into b_before, b_gp
  from public.player_ratings
  where user_id = r.black_player_id and bucket = v_bucket
  for update;

  w_after := greatest(100, least(4000, w_before + w_delta));
  b_after := greatest(100, least(4000, b_before + b_delta));

  update public.player_ratings
  set
    rating = w_after,
    games_played = games_played + 1,
    updated_at = now()
  where user_id = r.white_player_id and bucket = v_bucket;

  update public.player_ratings
  set
    rating = b_after,
    games_played = games_played + 1,
    updated_at = now()
  where user_id = r.black_player_id and bucket = v_bucket;

  out := jsonb_build_object(
    'applied', true,
    'reason', 'ok',
    'bucket', v_bucket,
    'white', jsonb_build_object(
      'user_id', r.white_player_id,
      'before', w_before,
      'after', w_after,
      'delta', w_delta,
      'games_played_before', w_gp,
      'games_played_after', w_gp + 1
    ),
    'black', jsonb_build_object(
      'user_id', r.black_player_id,
      'before', b_before,
      'after', b_after,
      'delta', b_delta,
      'games_played_before', b_gp,
      'games_played_after', b_gp + 1
    )
  );

  update public.games
  set
    rating_applied = true,
    rating_last_update = out
  where id = p_game_id and coalesce(rating_applied, false) is not true;

  get diagnostics v_games_updated = row_count;
  if v_games_updated = 0 then
    return jsonb_build_object('applied', false, 'reason', 'concurrent_apply_or_already_applied');
  end if;

  return out;
end;
$$;

create or replace function public.apply_free_play_rating_update(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  g public.games%rowtype;
begin
  if pg_trigger_depth() = 0 then
    select * into g from public.games where id = p_game_id;
    if not found then
      return jsonb_build_object('applied', false, 'reason', 'game_not_found');
    end if;
    if auth.uid() is null
       or (auth.uid() <> g.white_player_id and auth.uid() <> g.black_player_id) then
      return jsonb_build_object('applied', false, 'reason', 'not_authorized');
    end if;
  end if;
  return public.apply_free_play_rating_update_core(p_game_id);
end;
$$;

grant execute on function public.apply_free_play_rating_update(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Trigger: on transition to finished
-- ---------------------------------------------------------------------------
create or replace function public.trg_games_apply_free_rating_after_finish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.apply_free_play_rating_update_core(new.id);
  return new;
end;
$$;

drop trigger if exists games_apply_free_rating_after_finish on public.games;

create trigger games_apply_free_rating_after_finish
  after update of status on public.games
  for each row
  when (new.status = 'finished' and old.status is distinct from 'finished')
  execute function public.trg_games_apply_free_rating_after_finish();
