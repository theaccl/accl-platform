-- Phase 1H: dedicated bot-game configuration column (replaces rating_last_update hack).

alter table public.games
  add column if not exists bot_settings jsonb null;

comment on column public.games.bot_settings is
  'Bot-game configuration only (difficulty, personality, labels). Not used for rating accounting.';

-- Backfill from legacy rating_last_update.accl_bot_v1 without deleting old data.
update public.games g
set bot_settings = jsonb_strip_nulls(
  jsonb_build_object(
    'version', 'accl_bot_v1',
    'difficulty', g.rating_last_update->'accl_bot_v1'->'difficulty',
    'personalityStyle', g.rating_last_update->'accl_bot_v1'->'personalityStyle',
    'opponentLabel', g.rating_last_update->'accl_bot_v1'->'opponentLabel',
    'migratedFrom', 'rating_last_update'
  )
)
where g.source_type = 'bot_game'
  and g.bot_settings is null
  and g.rating_last_update is not null
  and jsonb_typeof(g.rating_last_update) = 'object'
  and g.rating_last_update ? 'accl_bot_v1'
  and jsonb_typeof(g.rating_last_update->'accl_bot_v1') = 'object';
