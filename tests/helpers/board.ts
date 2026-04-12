import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** Must match `options.id` on `Chessboard` in `app/game/[id]/page.tsx`. */
export const E2E_BOARD_DOM_ID = 'accl-e2e-board';

export async function clickBoardSquare(page: Page, square: string): Promise<void> {
  const el = page.locator(`#${E2E_BOARD_DOM_ID}-square-${square}`);
  await el.waitFor({ state: 'visible', timeout: 20_000 });
  await el.click();
}

/** White starts: e2 → e4 via click-move (works with `onSquareClick` path). */
export async function playOpeningE2E4(page: Page): Promise<void> {
  await clickBoardSquare(page, 'e2');
  await clickBoardSquare(page, 'e4');
}

/** Black replies e7 → e5 after 1.e4 (same click-move path; works on black-oriented boards). */
export async function playBlackE7E5(page: Page): Promise<void> {
  await clickBoardSquare(page, 'e7');
  await clickBoardSquare(page, 'e5');
}

/** Illegal from the initial position: pawn cannot jump from e2 to e5. */
export async function attemptIllegalPawnJumpE2E5(page: Page): Promise<void> {
  await clickBoardSquare(page, 'e2');
  await clickBoardSquare(page, 'e5');
}

/**
 * Fool’s mate — shortest checkmate (white cooperates). whitePage = white pieces, blackPage = black.
 * Requires both pages on the same live game with sync between moves.
 */
export async function playFoolsMateCooperative(whitePage: Page, blackPage: Page): Promise<void> {
  await expect(whitePage.getByTestId('game-turn-indicator')).toContainText('YOUR TURN', {
    timeout: 25_000,
  });
  await clickBoardSquare(whitePage, 'f2');
  await clickBoardSquare(whitePage, 'f3');

  await expect(blackPage.getByTestId('game-turn-indicator')).toContainText('YOUR TURN', {
    timeout: 30_000,
  });
  await clickBoardSquare(blackPage, 'e7');
  await clickBoardSquare(blackPage, 'e5');

  await expect(whitePage.getByTestId('game-turn-indicator')).toContainText('YOUR TURN', {
    timeout: 30_000,
  });
  await clickBoardSquare(whitePage, 'g2');
  await clickBoardSquare(whitePage, 'g4');

  await expect(blackPage.getByTestId('game-turn-indicator')).toContainText('YOUR TURN', {
    timeout: 30_000,
  });
  await clickBoardSquare(blackPage, 'd8');
  await clickBoardSquare(blackPage, 'h4');
}
