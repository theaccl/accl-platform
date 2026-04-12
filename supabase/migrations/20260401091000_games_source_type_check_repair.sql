-- Baseline repair: align games_source_type_check with app-required write paths.
-- Includes bot_game and preserves any existing source_type values already present in data.

do $$
declare
  required_values text[] := array[
    'random_match',
    'open_listing',
    'challenge',
    'rematch_request',
    'tournament_bracket',
    'bot_game',
    -- keep historical tournament marker accepted by reconciliation SQL.
    'tournament'
  ];
  merged_values text[];
  merged_literal text;
begin
  select array_agg(distinct v order by v)
    into merged_values
  from (
    select unnest(required_values) as v
    union
    select distinct source_type as v
    from public.games
    where source_type is not null and btrim(source_type) <> ''
  ) s;

  merged_literal := array_to_string(
    array(
      select quote_literal(v)
      from unnest(merged_values) as v
      order by v
    ),
    ', '
  );

  if exists (
    select 1
    from pg_constraint
    where conname = 'games_source_type_check'
      and conrelid = 'public.games'::regclass
  ) then
    execute 'alter table public.games drop constraint games_source_type_check';
  end if;

  execute format(
    'alter table public.games add constraint games_source_type_check check (source_type is null or source_type in (%s))',
    merged_literal
  );
end $$;

comment on constraint games_source_type_check on public.games is
  'Allowed source_type markers for game provenance; includes bot_game and preserved live historical values.';
