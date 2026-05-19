import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const routePath = join(process.cwd(), 'app', 'api', 'tester', 'bug-report', 'route.ts');
const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260519120000_tester_bug_reports_game_context.sql',
);

test.describe('tester bug report API (static)', () => {
  test('POST validates auth, category, game context, and uses insert helper', () => {
    const src = readFileSync(routePath, 'utf8');
    expect(src).toContain('resolveAuthenticatedUserId');
    expect(src).toContain('insertTesterBugReport');
    expect(src).toContain('TESTER_BUG_REPORT_CATEGORIES');
    expect(src).toContain('parseGameIdFromRoute');
    expect(src).toContain('testerBugReportClientMessage');
    expect(src).toContain('tester_bug_report');
    expect(src).not.toContain("'suspicious'");
  });

  test('migration adds game_id and expanded categories', () => {
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('game_id');
    expect(sql).toContain('cheating_concern');
    expect(sql).toContain('match_issue');
    expect(sql).toContain("on delete set null");
  });
});
