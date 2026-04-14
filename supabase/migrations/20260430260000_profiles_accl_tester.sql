-- ACCL tester cohort flag — source of truth for "in the invited tester cohort" (audit/reporting).
-- Route access to /tester/* remains auth + username (see lib/tester/testerAccessPolicy.ts); this flag is not a route gate by default.

alter table public.profiles
  add column if not exists accl_tester boolean not null default false;

comment on column public.profiles.accl_tester is
  'True when this profile is part of the ACCL tester cohort (invite list). Used for readiness audits; not necessarily a route ACL.';

create index if not exists profiles_accl_tester_true_idx
  on public.profiles (id)
  where accl_tester = true;
