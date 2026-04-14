import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const panelPath = join(process.cwd(), 'components', 'DirectChallengePanel.tsx');

test.describe('DirectChallengePanel identity (static)', () => {
  test('resolved opponent label uses publicDisplayNameFromProfileUsername with profile email for sanitization only', () => {
    const src = readFileSync(panelPath, 'utf8');
    expect(src).toContain('opponentProfileEmail');
    expect(src).toContain('publicDisplayNameFromProfileUsername(');
    expect(src).toContain('setOpponentEmail(p.username?.trim()');
  });
});
