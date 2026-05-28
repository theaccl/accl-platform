-- Official ACCL free-play time controls: Bullet 2 (2m/2+0), Daily 7d, parity with lib/acclTimeControls.ts.
-- Legacy 20m, 5d remain allowed for existing rows.

-- games.live_time_control
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.games'::regclass
      and conname = 'games_live_time_control_check'
  ) then
    alter table public.games drop constraint games_live_time_control_check;
  end if;
end $$;

alter table public.games
  add constraint games_live_time_control_check check (
    live_time_control is null
    or btrim(live_time_control) = ''
    or lower(btrim(live_time_control)) in (
      '1m', '1+1', '2m', '2+0', '2+1',
      '3m', '3+2', '5m', '5+5',
      '10m', '15m', '20m', '30m', '60m',
      '1d', '2d', '3d', '5d', '7d',
      '5m+3s'
    )
  );

comment on constraint games_live_time_control_check on public.games is
  'Clock tokens; official free-play + legacy 20m/5d. Sync with lib/acclTimeControls.ts.';

-- match_requests.live_time_control
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.match_requests'::regclass
      and conname = 'match_requests_live_time_control_check'
  ) then
    alter table public.match_requests drop constraint match_requests_live_time_control_check;
  end if;
end $$;

alter table public.match_requests
  add constraint match_requests_live_time_control_check check (
    live_time_control is null
    or btrim(live_time_control) = ''
    or lower(btrim(live_time_control)) in (
      '1m', '1+1', '2m', '2+0', '2+1',
      '3m', '3+2', '5m', '5+5', '5m+5',
      '10m', '15m', '20m', '30m', '60m',
      '1d', '2d', '3d', '5d', '7d',
      '5m+3s'
    )
  );

comment on constraint match_requests_live_time_control_check on public.match_requests is
  'Clock tokens; official free-play + legacy. Sync with lib/acclTimeControls.ts.';

-- P1 classifier: 2m bullet, 7d/5d daily (lib/p1RatingClassifier.ts)
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

  if lc in ('1d', '2d', '3d', '5d', '7d') then
    return 'free_day';
  end if;

  m := regexp_match(lc, '^([0-9]+)\s*\+\s*([0-9]+)$');
  if m is not null then
    inc1 := m[1]::int;
    inc2 := m[2]::int;
    if inc1 = 1 and inc2 = 1 then return 'free_bullet'; end if;
    if inc1 = 2 and inc2 = 1 then return 'free_bullet'; end if;
    if inc1 = 3 and inc2 = 2 then return 'free_blitz'; end if;
    if inc1 = 5 and inc2 = 5 then return 'free_blitz'; end if;
    return null;
  end if;

  if lc = '2+0' then
    return 'free_bullet';
  end if;

  if lc ~ '^[0-9]+m$' then
    mins := (substring(lc from '^([0-9]+)m$'))::int;
    if mins in (1, 2) then return 'free_bullet'; end if;
    if mins in (3, 5) then return 'free_blitz'; end if;
    if mins in (10, 15, 20, 30, 60) then return 'free_rapid'; end if;
    return null;
  end if;

  if t = 'daily' then
    if lc in ('30m', '60m') then return 'free_rapid'; end if;
    if lc in ('1d', '2d', '3d', '5d', '7d') then return 'free_day'; end if;
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

-- Badge exact track: daily_7_day (lib/badgeTracks.ts)
create or replace function public.classify_free_badge_track_key(
  p_tempo text,
  p_live_time_control text
)
returns text
language plpgsql
immutable
as $$
declare
  v_t text;
  v_lc text;
begin
  v_t := lower(trim(coalesce(p_tempo, '')));
  v_lc := lower(trim(coalesce(p_live_time_control, '')));
  v_lc := regexp_replace(v_lc, '\s+', '', 'g');
  if v_lc = '' then
    return null;
  end if;

  if v_t in ('correspondence', 'daily') or v_lc ~ 'd$' then
    return case v_lc
      when '1d' then 'daily_1_day'
      when '2d' then 'daily_2_day'
      when '3d' then 'daily_3_day'
      when '5d' then 'daily_5_day'
      when '7d' then 'daily_7_day'
      else null
    end;
  end if;

  if v_t not in ('', 'live') then
    return null;
  end if;

  return case v_lc
    when '1m' then 'bullet_1_0'
    when '1+1' then 'bullet_1_1'
    when '2m' then 'bullet_2_0'
    when '2+0' then 'bullet_2_0'
    when '2+1' then 'bullet_2_1'
    when '3m' then 'blitz_3_0'
    when '3+2' then 'blitz_3_2'
    when '5m' then 'blitz_5_0'
    when '5+5' then 'blitz_5_5'
    when '10m' then 'rapid_10_0'
    when '15m' then 'rapid_15_0'
    when '20m' then 'rapid_20_0'
    when '30m' then 'rapid_30_0'
    when '60m' then 'rapid_60_0'
    else null
  end;
end;
$$;

-- Open-seat slot key (lib/platOpenSeatBucket.ts)
create or replace function public.free_play_queue_slot_key(
  p_tempo text,
  p_ltc text,
  p_rated boolean
) returns text
language plpgsql
immutable
set search_path = public
as $f$
declare
  t text := lower(btrim(coalesce(p_tempo, '')));
  c text := lower(regexp_replace(btrim(coalesce(p_ltc, '')), E'[[:space:]]+', '', 'g'));
  m text;
begin
  if t = 'correspondence' then
    return null;
  end if;
  if t = 'daily' then
    if c in ('1d', '2d', '3d', '5d', '7d') then
      m := 'daily';
    elsif c in ('30m', '60m') then
      m := 'rapid';
    else
      m := 'daily';
    end if;
  elsif t = 'live' then
    m := case
      when c in ('1m', '1+1', '2m', '2+0', '2+1') then 'bullet'
      when c in ('3m', '3+2', '5m', '5+5', '5m+3s') then 'blitz'
      when c in ('10m', '15m', '20m', '30m', '60m') then 'rapid'
      else null
    end;
  else
    return null;
  end if;
  if m is null or c = '' then
    return null;
  end if;
  return m || ':' || c || ':' || case when coalesce(p_rated, false) then 't' else 'f' end;
end;
$f$;
