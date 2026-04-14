import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const createPagePath = join(process.cwd(), 'app', 'free', 'create', 'page.tsx');

test.describe('/free/create wiring (static)', () => {
  test('renders DirectChallengePanel in single-step mode instead of a dead form', () => {
    const src = readFileSync(createPagePath, 'utf8');
    expect(src).toContain('DirectChallengePanel');
    expect(src).toContain('singleStep');
    expect(src).not.toMatch(/<button[^>]*>\s*SEND CHALLENGE\s*<\/button>/i);
  });
});
