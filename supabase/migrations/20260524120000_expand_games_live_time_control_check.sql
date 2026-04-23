-- Align games.live_time_control CHECK with free-play PLAT UI (increment + extra rapid clocks).
-- Live previously rejected inserts for 1+1, 3+2, 15m, 20m, etc. when an older allowlist existed.

do $$
begin
  if exists (
    select 1
    from pg_constraint
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
      -- Live PLAT (free play + ratings family)
      '1m',
      '1+1',
      '2+1',
      '3m',
      '3+2',
      '5m',
      '5+5',
      '10m',
      '15m',
      '20m',
      '30m',
      '60m',
      -- Daily / correspondence pacing on games.tempo = daily
      '1d',
      '2d',
      '3d',
      -- Legacy / trainer / older rows still seen in the wild
      '5m+3s'
    )
  );

comment on constraint games_live_time_control_check on public.games is
  'Allowed clock tokens for live + daily rows; keep in sync with lib/freePlayModeTimeControl + lib/gameTimeControl.';
