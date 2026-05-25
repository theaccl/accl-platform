import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test.describe('GameNotationStrip', () => {
  test('always renders fixed test id and placeholder when movetext empty', () => {
    const src = readFileSync(join(process.cwd(), 'components/game/GameNotationStrip.tsx'), 'utf8');
    expect(src).toContain('data-testid="game-notation-strip"');
    expect(src).toContain('Moves will appear here.');
    expect(src).not.toMatch(/moveLogs\.length\s*>\s*0/);
  });
});
