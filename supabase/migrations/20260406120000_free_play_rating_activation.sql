-- Free-play rating: columns on `games` used for idempotency and debug snapshots.
-- Functions, `player_ratings`, and finish trigger are installed in
-- 20260409120000_rating_system_eight_bucket_fresh.sql.

alter table public.games
  add column if not exists rating_applied boolean not null default false;

alter table public.games
  add column if not exists rating_last_update jsonb null;

alter table public.games
  add column if not exists live_time_control text null;

comment on column public.games.rating_applied is 'When true, apply_free_play_rating_update_core has already run for this game (idempotency).';
comment on column public.games.rating_last_update is 'Last free-play rating snapshot: bucket, before/after, deltas (debug).';
