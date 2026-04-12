-- Move history for replay, lobby "last move", and realtime sync.
-- Apply in Supabase SQL Editor or: supabase db push

create table if not exists public.game_move_logs (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null,
  san text not null,
  from_sq text,
  to_sq text,
  fen_before text,
  fen_after text,
  move_duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists game_move_logs_game_id_created_at_idx
  on public.game_move_logs (game_id, created_at);

alter table public.game_move_logs enable row level security;

create policy "game_move_logs_select_participants"
  on public.game_move_logs for select
  to authenticated
  using (
    exists (
      select 1
      from public.games g
      where g.id = game_id
        and (
          g.white_player_id = (select auth.uid())
          or g.black_player_id = (select auth.uid())
        )
    )
  );

create policy "game_move_logs_insert_self"
  on public.game_move_logs for insert
  to authenticated
  with check (
    player_id = (select auth.uid())
    and exists (
      select 1
      from public.games g
      where g.id = game_id
        and (
          g.white_player_id = (select auth.uid())
          or g.black_player_id = (select auth.uid())
        )
    )
  );

do $pub$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table public.game_move_logs';
    exception
      when duplicate_object then null;
    end;
  end if;
end $pub$;
