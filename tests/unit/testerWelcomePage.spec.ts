import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const welcomePath = join(process.cwd(), 'app', 'tester', 'welcome', 'page.tsx');

test.describe('tester welcome page (static)', () => {
  test('includes required copy and destinations', () => {
    const src = readFileSync(welcomePath, 'utf8');
    expect(src).toContain('You are in the ACCL test environment');
    expect(src).toContain('Known limitations');
    expect(src).toContain('/nexus');
    expect(src).toContain('/free');
    expect(src).toContain('/tester/lobby-chat');
    expect(src).toContain('/tester/messages');
    expect(src).toContain('lobby-ready');
  });
});
