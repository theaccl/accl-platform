-- ACCL rating architecture: game row classification fields.
-- Per-bucket ratings live in `player_ratings` (created in 20260409120000_rating_system_eight_bucket_fresh.sql).

-- Game context for rating classification (free vs tournament).
alter table public.games
  add column if not exists play_context text not null default 'free'
    constraint games_play_context_check check (play_context in ('free', 'tournament'));

alter table public.games
  add column if not exists tournament_id uuid null;

comment on column public.games.play_context is 'free = casual; tournament = bracket event (rating deltas deferred until bracket rules say so).';
comment on column public.games.tournament_id is 'Optional FK target when tournaments table exists; nullable for foundation phase.';

comment on column public.profiles.rating is 'Legacy single display rating; prefer player_ratings. New work should read bucket-specific rows.';
