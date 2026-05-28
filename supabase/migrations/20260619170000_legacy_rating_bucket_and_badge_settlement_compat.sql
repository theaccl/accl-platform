-- Legacy six-bucket classifier parity for official ACCL live/daily clocks.
-- Production ledger live validation proved mode append on game
-- 5f79f6d7-2368-4a49-b626-5f3fa7f3694b; legacy classify_rating_bucket still rejected 5+5 / increments.
-- P1 + badge exact-track classifiers: 20260619150000_accl_official_time_control_parity.sql

-- ---------------------------------------------------------------------------
-- Legacy pace bucket (free_live | free_daily | free_correspondence × context)
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

  if lc in ('1d', '2d', '3d') then
    return pref || 'correspondence';
  end if;

  if t = 'daily' then
    if lc in ('', '1d', '2d', '3d', '5d', '7d', '30m', '60m') then
      return pref || 'daily';
    end if;
    return null;
  end if;

  -- Legacy/async day tokens still readable when tempo was stored as live.
  if lc in ('5d', '7d') then
    return pref || 'daily';
  end if;

  if t <> '' and t <> 'live' then
    return null;
  end if;

  -- Official Bullet / Blitz / Rapid live clocks + legacy 20m / 5m+3s → pace bucket "live".
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
  'Legacy six pace buckets (live|daily|correspondence) × play context. Official ACCL clocks incl. 5+5, 2+0, 7d, legacy 20m/5d. INVALID → NULL.';

-- Expected spot checks (run in SQL editor after apply):
--   select public.classify_rating_bucket('free', 'live', '5+5');  -- free_live
--   select public.classify_rating_bucket('free', 'daily', '7d');  -- free_daily
--   select public.classify_rating_bucket('free', 'live', '20m');  -- free_live

-- ---------------------------------------------------------------------------
-- Badge settlement compat shim — only when real function missing from history
-- ---------------------------------------------------------------------------
do $compat$
begin
  if to_regprocedure('public.apply_free_play_badge_settlement(uuid,jsonb)') is null then
    execute $fn$
      create function public.apply_free_play_badge_settlement(
        p_game_id uuid,
        p_rating_snapshot jsonb
      )
      returns jsonb
      language plpgsql
      security definer
      set search_path = public
      as $body$
      begin
        return jsonb_build_object(
          'applied', false,
          'reason', 'badge_settlement_function_missing_compat_shim'
        );
      end;
      $body$;
    $fn$;

    comment on function public.apply_free_play_badge_settlement(uuid, jsonb) is
      'Compat shim when 20260619120000 badge settlement is absent; never fakes applied=true.';

    revoke all on function public.apply_free_play_badge_settlement(uuid, jsonb) from public;
    grant execute on function public.apply_free_play_badge_settlement(uuid, jsonb) to service_role;
  end if;
end;
$compat$;
