-- Read-only: exact live definition of games_end_reason_check (run in Supabase SQL Editor).
select
  c.conname,
  pg_get_constraintdef(c.oid) as constraint_definition
from pg_constraint c
join pg_class t
  on c.conrelid = t.oid
join pg_namespace n
  on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'games'
  and c.conname = 'games_end_reason_check';
