-- Lightweight tester bug / feedback intake (not a ticketing system).

create table if not exists public.tester_bug_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  category text
    check (
      category is null
      or category in ('bug', 'ux', 'suggestion', 'suspicious')
    ),
  route text not null default '',
  constraint tester_bug_reports_body_len check (char_length(trim(body)) between 1 and 8000),
  constraint tester_bug_reports_route_len check (char_length(route) <= 2048)
);

create index if not exists tester_bug_reports_created_idx
  on public.tester_bug_reports (created_at desc);

create index if not exists tester_bug_reports_reporter_created_idx
  on public.tester_bug_reports (reporter_id, created_at desc);

alter table public.tester_bug_reports enable row level security;

drop policy if exists tester_bug_reports_service_all on public.tester_bug_reports;
create policy tester_bug_reports_service_all
  on public.tester_bug_reports
  for all
  to service_role
  using (true)
  with check (true);
