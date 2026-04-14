import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const routePath = join(process.cwd(), 'app', 'api', 'tester', 'bug-report', 'route.ts');

test.describe('tester bug report API (static)', () => {
  test('POST validates auth, category, and uses insert helper', () => {
    const src = readFileSync(routePath, 'utf8');
    expect(src).toContain('resolveAuthenticatedUserId');
    expect(src).toContain("insertTesterBugReport");
    expect(src).toContain("'bug'");
    expect(src).toContain("'suspicious'");
    expect(src).toContain('tester_bug_report');
  });
});
