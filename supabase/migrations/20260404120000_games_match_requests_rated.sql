-- Free-play rated vs unrated: explicit column on games and match_requests.
-- Carried from request → game on accept; rematch copies from finished game row.

alter table public.games
  add column if not exists rated boolean not null default false;

alter table public.match_requests
  add column if not exists rated boolean not null default false;

comment on column public.games.rated is 'When true, game is intended to count for rating when the rating engine runs.';
comment on column public.match_requests.rated is 'Preferred rating type; copied to games.rated when the request is accepted.';
