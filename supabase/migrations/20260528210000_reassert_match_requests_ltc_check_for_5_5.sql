-- Re-assert allowlist (incl. 5+5, 5m+5) for deployments that may not have 20260526120000 applied.
-- Direct challenges must not fail on CHECK when UI sends canonical `5+5`.

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
      '5m+5',
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
  'Allowed clock tokens; keep in sync with lib/gameTimeControl + DirectChallengePanel. Re-assert 5+5 for prod.';
