import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { nearestReplayNotationScrollTop } from '@/lib/replayNotationScroll';

const gamePagePath = join(process.cwd(), 'app', 'game', '[id]', 'page.tsx');

test.describe('post-game replay notation auto-follow', () => {
  test('keeps the active move visible during playback and manual stepping', () => {
    const src = readFileSync(gamePagePath, 'utf8');

    expect(src).toContain('replayMoveListRef');
    expect(src).toContain('data-testid="game-replay-move-list-scroll"');
    expect(src).toContain('data-replay-step={idx + 1}');
    expect(src).toContain('nearestReplayNotationScrollTop({');
    expect(src).toContain('scroller.scrollTop = nextScrollTop');
    expect(src).not.toContain('activeMove?.scrollIntoView(');
    expect(src).toContain('}, [replayStep]);');
  });

  test('scrolls only enough to reveal an item below the notation viewport', () => {
    expect(
      nearestReplayNotationScrollTop({
        scrollTop: 100,
        viewportTop: 200,
        viewportBottom: 380,
        itemTop: 390,
        itemBottom: 415,
      }),
    ).toBe(135);
  });

  test('scrolls upward and leaves already-visible moves unchanged', () => {
    expect(
      nearestReplayNotationScrollTop({
        scrollTop: 100,
        viewportTop: 200,
        viewportBottom: 380,
        itemTop: 170,
        itemBottom: 195,
      }),
    ).toBe(70);
    expect(
      nearestReplayNotationScrollTop({
        scrollTop: 100,
        viewportTop: 200,
        viewportBottom: 380,
        itemTop: 250,
        itemBottom: 275,
      }),
    ).toBe(100);
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
