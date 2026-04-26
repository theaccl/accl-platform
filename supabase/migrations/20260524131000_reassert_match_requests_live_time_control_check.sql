-- Re-apply match_requests live_time_control CHECK (idempotent) so production matches PLAT tokens
-- after client-side normalization in lib/gameTimeControl.canonicalLiveTimeControlForInsert.

do $$
begin
  if exists (
    select 1
    from pg_constraint
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
      '1d',
      '2d',
      '3d',
      '5m+3s'
    )
  );

comment on constraint match_requests_live_time_control_check on public.match_requests is
  'Allowed clock tokens for live + daily direct/open requests; keep in sync with lib/freePlayModeTimeControl + lib/gameTimeControl.';
