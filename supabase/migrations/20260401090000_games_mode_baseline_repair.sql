-- Baseline repair: ensure public.games.mode exists before downstream migrations/RPCs reference it.
-- Safe for drifted environments where mode was never added.

alter table public.games
  add column if not exists mode text;

-- Backfill mode for existing rows using the strongest available signal.
update public.games
set mode = case
  when coalesce(play_context, '') = 'tournament' then 'PIT'
  else 'SKETCH'
end
where mode is null or btrim(mode) = '';

alter table public.games
  alter column mode set default 'SKETCH';

-- Enforce expected mode domain used by app/runtime.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'games_mode_check'
      and conrelid = 'public.games'::regclass
  ) then
    alter table public.games drop constraint games_mode_check;
  end if;
end $$;

alter table public.games
  add constraint games_mode_check
  check (mode in ('SKETCH', 'PIT'));

alter table public.games
  alter column mode set not null;

comment on column public.games.mode is
  'Board mode: SKETCH for free-play/default boards, PIT for tournament integrity path.';
