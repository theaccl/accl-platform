import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const profilePage = join(process.cwd(), 'app', 'profile', '[id]', 'page.tsx');

test.describe('profile tester feedback entry', () => {
  test('own profile exposes report trigger', () => {
    const src = readFileSync(profilePage, 'utf8');
    expect(src).toContain('TesterBugReportTrigger');
    expect(src).toContain('profile-self-actions');
    expect(src).toContain('isSelf');
  });
});
