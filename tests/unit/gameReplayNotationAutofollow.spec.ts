import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const gamePagePath = join(process.cwd(), 'app', 'game', '[id]', 'page.tsx');

test.describe('post-game replay notation auto-follow', () => {
  test('keeps the active move visible during playback and manual stepping', () => {
    const src = readFileSync(gamePagePath, 'utf8');

    expect(src).toContain('replayMoveListRef');
    expect(src).toContain('data-testid="game-replay-move-list-scroll"');
    expect(src).toContain('data-replay-step={idx + 1}');
    expect(src).toContain('activeMove?.scrollIntoView({ block: \'nearest\', inline: \'nearest\' });');
    expect(src).toContain('}, [replayStep]);');
  });

  test('does not alter the dedicated finished-game review auto-follow', () => {
    const src = readFileSync(
      join(process.cwd(), 'app', 'finished', '[id]', 'page.tsx'),
      'utf8',
    );

    expect(src).toContain('data-testid="finished-move-list-scroll"');
    expect(src).toContain('activeMove?.scrollIntoView({ block: "nearest", inline: "nearest" });');
  });
});
