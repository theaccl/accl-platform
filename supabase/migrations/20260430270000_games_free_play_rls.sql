-- Free Play: explicit RLS on public.games so authenticated clients can create open-seat rows
-- (Find Match on /free/play) and participants can read/update their games.
-- Service-role routes (e.g. submit-move) bypass RLS; SECURITY DEFINER RPCs run as owner.

alter table public.games enable row level security;

-- Replace same-named policies if re-applied (idempotent deploys).
drop policy if exists "games_authenticated_insert_free_open_seat" on public.games;
drop policy if exists "games_authenticated_select_participant" on public.games;
drop policy if exists "games_authenticated_update_participant" on public.games;

-- New open-seat game: creator must be White, no tournament, free play only.
create policy "games_authenticated_insert_free_open_seat"
  on public.games
  for insert
  to authenticated
  with check (
    play_context = 'free'
    and tournament_id is null
    and white_player_id = (select auth.uid())
    and black_player_id is null
    and coalesce(status, '') in ('active', 'waiting')
  );

-- Seated players (or solo White waiting for Black) can read the row.
create policy "games_authenticated_select_participant"
  on public.games
  for select
  to authenticated
  using (
    white_player_id = (select auth.uid())
    or black_player_id = (select auth.uid())
  );

-- Draw offers, clock fields, etc.: only seated players may update.
create policy "games_authenticated_update_participant"
  on public.games
  for update
  to authenticated
  using (
    white_player_id = (select auth.uid())
    or black_player_id = (select auth.uid())
  )
  with check (
    white_player_id = (select auth.uid())
    or black_player_id = (select auth.uid())
  );

comment on policy "games_authenticated_insert_free_open_seat" on public.games is
  'Authenticated user may insert a free-play open seat only as White with black_player_id null.';

comment on policy "games_authenticated_select_participant" on public.games is
  'White or Black may SELECT games they participate in.';

comment on policy "games_authenticated_update_participant" on public.games is
  'White or Black may UPDATE rows they already participate in (client-side draw/cleanup; moves often via API).';
