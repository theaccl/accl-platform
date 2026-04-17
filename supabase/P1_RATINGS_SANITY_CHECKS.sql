-- Run after applying 20260516120000_p1_ratings_truth_additive.sql
-- Migration results: row counts per bucket
select bucket, count(*) as rows, sum(games_played) as total_gp
from public.player_ratings
group by bucket
order by bucket;

-- Sample user: pick one profile with non-default legacy data (adjust uuid)
-- Before/after style: legacy six vs P1 five (same user_id)
-- select * from public.player_ratings where user_id = '...'::uuid order by bucket;
