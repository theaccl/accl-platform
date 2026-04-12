import { test, expect } from '@playwright/test';

import { START_FEN } from '@/lib/startFen';
import { hasTwoUserE2ECredentials } from '../fixtures/env';
import {
  attemptIllegalPawnJumpE2E5,
  clickBoardSquare,
  playBlackE7E5,
  playOpeningE2E4,
} from '../helpers/board';
import { expectBothOnGame, setupPairedGameViaFreeFindMatch } from '../helpers/freeQueuePair';
import { readGameStartupSnapshot } from '../helpers/gameStartupSnapshot';

function fenFirstFourFields(fen: string): string {
  return fen
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join(' ');
}

/** First four fields after 1.e4 — halfmove / fullmove may vary by server normalization. */
const FEN4_AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -';

/** First four fields after 1.e4 e5. */
const FEN4_AFTER_E4_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -';

function dataFenAttributeRegex(firstFourSpaceSeparated: string): RegExp {
  const escaped = firstFourSpaceSeparated.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped} \\d+ \\d+$`);
}

const RE_FEN_ATTR_AFTER_E4 = dataFenAttributeRegex(FEN4_AFTER_E4);
const RE_FEN_ATTR_AFTER_E4_E5 = dataFenAttributeRegex(FEN4_AFTER_E4_E5);

test.describe('gameplay move sync (/free queue)', () => {
  test.skip(!hasTwoUserE2ECredentials(), 'Set all four E2E_USER_* and E2E_USER_B_* env vars');
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  test('first move activates timing + clocks; board and turn sync; illegal / out-of-turn blocked', async ({
    browser,
  }) => {
    const { pageA, pageB, gameId, dispose } = await setupPairedGameViaFreeFindMatch(browser);
    try {
      await expectBothOnGame(pageA, pageB, gameId);

      const preA = await readGameStartupSnapshot(pageA);
      const preB = await readGameStartupSnapshot(pageB);
      expect(fenFirstFourFields(preA.fen)).toBe(fenFirstFourFields(START_FEN));
      expect(fenFirstFourFields(preB.fen)).toBe(fenFirstFourFields(START_FEN));
      expect(preA.lastMoveAt.trim()).toBe('');
      expect(preB.lastMoveAt.trim()).toBe('');
      expect(preA.moveDeadlineAt.trim()).toBe('');
      expect(preB.moveDeadlineAt.trim()).toBe('');
      expect(preA.turn).toBe('white');
      expect(preB.turn).toBe('white');

      await attemptIllegalPawnJumpE2E5(pageA);
      const postBad = await readGameStartupSnapshot(pageA);
      expect(fenFirstFourFields(postBad.fen)).toBe(fenFirstFourFields(START_FEN));
      expect(postBad.lastMoveAt.trim()).toBe('');
      expect(postBad.turn).toBe('white');

      await playOpeningE2E4(pageA);

      await expect(pageA.getByTestId('game-startup-snapshot')).toHaveAttribute('data-last-move-at', /./, {
        timeout: 30_000,
      });
      await expect(pageA.getByTestId('game-startup-snapshot')).toHaveAttribute('data-fen', RE_FEN_ATTR_AFTER_E4, {
        timeout: 15_000,
      });
      await expect(pageA.getByTestId('game-startup-snapshot')).toHaveAttribute('data-turn', 'black', {
        timeout: 15_000,
      });
      await expect(pageA.getByTestId('digital-chess-clock')).toHaveAttribute('data-clock-ticking', 'true', {
        timeout: 15_000,
      });
      await expect(pageA.getByTestId('game-startup-snapshot')).toHaveAttribute('data-move-deadline-at', '', {
        timeout: 5_000,
      });

      await expect(pageB.getByTestId('game-startup-snapshot')).toHaveAttribute('data-fen', RE_FEN_ATTR_AFTER_E4, {
        timeout: 30_000,
      });
      await expect(pageB.getByTestId('game-startup-snapshot')).toHaveAttribute('data-last-move-at', /./, {
        timeout: 30_000,
      });
      await expect(pageB.getByTestId('game-startup-snapshot')).toHaveAttribute('data-turn', 'black', {
        timeout: 30_000,
      });
      await expect(pageB.getByTestId('digital-chess-clock')).toHaveAttribute('data-clock-ticking', 'true', {
        timeout: 30_000,
      });

      await expect(pageA.getByTestId('game-startup-snapshot')).toHaveAttribute('data-fen', RE_FEN_ATTR_AFTER_E4, {
        timeout: 15_000,
      });

      const midA = await readGameStartupSnapshot(pageA);
      const midB = await readGameStartupSnapshot(pageB);
      expect(fenFirstFourFields(midA.fen)).toBe(fenFirstFourFields(midB.fen));
      expect(midA.lastMoveAt).toBe(midB.lastMoveAt);
      expect(midA.turn).toBe(midB.turn);
      expect(midA.moveDeadlineAt).toBe(midB.moveDeadlineAt);

      const fenBeforeOutOfTurn = midA.fen;
      const lastMoveBeforeOutOfTurn = midA.lastMoveAt;
      await clickBoardSquare(pageA, 'd2');
      await clickBoardSquare(pageA, 'd4');
      const afterWhiteTwice = await readGameStartupSnapshot(pageA);
      expect(fenFirstFourFields(afterWhiteTwice.fen)).toBe(fenFirstFourFields(fenBeforeOutOfTurn));
      expect(afterWhiteTwice.lastMoveAt).toBe(lastMoveBeforeOutOfTurn);
      expect(afterWhiteTwice.turn).toBe('black');

      await playBlackE7E5(pageB);
      await expect(pageB.getByTestId('game-startup-snapshot')).toHaveAttribute('data-fen', RE_FEN_ATTR_AFTER_E4_E5, {
        timeout: 30_000,
      });
      await expect(pageB.getByTestId('game-startup-snapshot')).toHaveAttribute('data-turn', 'white', {
        timeout: 30_000,
      });
      await expect(pageA.getByTestId('game-startup-snapshot')).toHaveAttribute('data-fen', RE_FEN_ATTR_AFTER_E4_E5, {
        timeout: 30_000,
      });
      await expect(pageA.getByTestId('game-startup-snapshot')).toHaveAttribute('data-turn', 'white', {
        timeout: 30_000,
      });

      const endA = await readGameStartupSnapshot(pageA);
      const endB = await readGameStartupSnapshot(pageB);
      expect(fenFirstFourFields(endA.fen)).toBe(fenFirstFourFields(endB.fen));
      expect(endA.turn).toBe(endB.turn);
      expect(endA.lastMoveAt).toBe(endB.lastMoveAt);
    } finally {
      await dispose();
    }
  });
});
