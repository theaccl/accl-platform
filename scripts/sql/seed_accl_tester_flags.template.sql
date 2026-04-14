-- Template: mark known tester profiles after accounts exist (replace UUIDs; run in SQL editor or migration fork).
-- Never commit real production UUIDs or emails to public repos.

-- Example: promote specific profiles into the tester cohort
-- update public.profiles
--   set accl_tester = true
--   where id in (
--     '00000000-0000-0000-0000-000000000001'::uuid,
--     '00000000-0000-0000-0000-000000000002'::uuid
--   );

-- Clear flags (staging reset)
-- update public.profiles set accl_tester = false where accl_tester = true;
