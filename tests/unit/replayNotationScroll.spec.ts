import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { replayMoveScrollDelta } from '@/lib/replay/keepReplayMoveVisible';

test.describe('game replay notation scrolling', () => {
  test('scrolls only when the active move leaves the notation viewport', () => {
    const viewport = { top: 100, bottom: 280 };

    expect(replayMoveScrollDelta(viewport, { top: 160, bottom: 180 })).toBe(0);
    expect(replayMoveScrollDelta(viewport, { top: 72, bottom: 92 })).toBe(-28);
    expect(replayMoveScrollDelta(viewport, { top: 286, bottom: 310 })).toBe(30);
  });

  test('production game route wires every move to the scroll follower', () => {
    const src = readFileSync(
      join(process.cwd(), 'app', 'game', '[id]', 'page.tsx'),
      'utf8'
    );

    expect(src).toContain('ref={replayMoveListRef}');
    expect(src).toContain('data-testid="game-replay-move-list"');
    expect(src).toContain('data-replay-step={idx + 1}');
    expect(src).toContain('keepReplayMoveVisible(moveList, activeMove);');
  });

  test('finished replay is rendered in the play column directly after the board', () => {
    const src = readFileSync(
      join(process.cwd(), 'app', 'game', '[id]', 'page.tsx'),
      'utf8'
    );
    const boardIndex = src.indexOf('data-testid="game-board-with-tournament-rail"');
    const replayIndex = src.indexOf('data-testid="game-replay-panel"');
    const tailIndex = src.indexOf('className="accl-game-shell-tail"');

    expect(boardIndex).toBeGreaterThan(-1);
    expect(replayIndex).toBeGreaterThan(boardIndex);
    expect(tailIndex).toBeGreaterThan(replayIndex);
  });
});
