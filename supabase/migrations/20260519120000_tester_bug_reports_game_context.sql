-- Tester feedback: optional game context + expanded categories (observational intake only).

alter table public.tester_bug_reports
  add column if not exists game_id uuid references public.games (id) on delete set null;

create index if not exists tester_bug_reports_game_id_idx
  on public.tester_bug_reports (game_id)
  where game_id is not null;

update public.tester_bug_reports
set category = 'cheating_concern'
where category = 'suspicious';

update public.tester_bug_reports
set category = 'ui_issue'
where category = 'ux';

update public.tester_bug_reports
set category = 'other'
where category = 'suggestion';

alter table public.tester_bug_reports
  drop constraint if exists tester_bug_reports_category_check;

alter table public.tester_bug_reports
  add constraint tester_bug_reports_category_check
  check (
    category is null
    or category in (
      'bug',
      'confusion',
      'match_issue',
      'ui_issue',
      'cheating_concern',
      'other'
    )
  );
