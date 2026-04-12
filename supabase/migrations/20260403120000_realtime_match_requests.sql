-- Enable postgres_changes for match_requests (challenger auto-launch, lobby, /requests inbox).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table public.match_requests';
    exception
      when duplicate_object then null;
    end;
  end if;
end$$;
