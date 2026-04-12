-- Broadcast row changes so opponent clients receive postgres_changes on `games`
-- (move patch: fen, turn, clocks, last_move_at). Without this, only `game_move_logs`
-- events fire if that table is in the publication, and sync depends on inserts.

do $pub$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table public.games';
    exception
      when duplicate_object then null;
    end;
  end if;
end $pub$;
