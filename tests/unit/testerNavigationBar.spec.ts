import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const navPath = join(process.cwd(), 'components', 'NavigationBar.tsx');

test.describe('NavigationBar tester links (static)', () => {
  test('logged-in strip lists core tester destinations', () => {
    const src = readFileSync(navPath, 'utf8');
    expect(src).toContain('/tester/messages');
    expect(src).toContain('Mailbox');
    expect(src).toContain('/players');
    expect(src).toContain('TesterBugReportTrigger');
    expect(src).not.toContain('href="/nexus"');
  });
});
