-- Daily tempo must win over day-token correspondence shortcut (production fix after 91d4615).
-- Preserves 5+5 / official live clocks from 20260619170000.

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
  lc := regexp_replace(lc, '\s+', '', 'g');

  if t = 'correspondence' then
    return pref || 'correspondence';
  end if;

  -- Daily tempo before 1d/2d/3d correspondence shortcut (official Daily 1d/2d/3d/7d).
  if t = 'daily' then
    if lc in ('', '1d', '2d', '3d', '5d', '7d', '30m', '60m') then
      return pref || 'daily';
    end if;
    return null;
  end if;

  if lc in ('1d', '2d', '3d') then
    return pref || 'correspondence';
  end if;

  if lc in ('5d', '7d') then
    return pref || 'daily';
  end if;

  if t <> '' and t <> 'live' then
    return null;
  end if;

  if lc in (
    '1m', '1+1', '2m', '2+0', '2+1',
    '3m', '3+2', '5m', '5+5', '5m+3s', '5m+5',
    '10m', '15m', '20m', '30m', '60m',
    ''
  ) then
    return pref || 'live';
  end if;

  return null;
end;
$$;

comment on function public.classify_rating_bucket(text, text, text) is
  'Legacy six pace buckets; daily tempo precedes 1d/2d/3d correspondence. Official live incl. 5+5.';

-- Spot checks:
--   select public.classify_rating_bucket('free', 'daily', '1d');  -- free_daily
--   select public.classify_rating_bucket('free', 'daily', '2d');  -- free_daily
--   select public.classify_rating_bucket('free', 'daily', '3d');  -- free_daily
--   select public.classify_rating_bucket('free', 'daily', '7d');  -- free_daily
--   select public.classify_rating_bucket('free', 'live', '5+5');  -- free_live
