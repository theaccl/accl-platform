import { test, expect } from '@playwright/test';

import { hasTwoUserE2ECredentials } from '../fixtures/env';
import { playFoolsMateCooperative } from '../helpers/board';
import { expectFinishedParitySummary } from '../helpers/finishedGameUi';
import { setupAcceptedLiveChallenge } from '../helpers/liveChallengePair';

/**
 * Terminal finish: move-only `games.update`, then `finish_game` with checkmate result/reason (Phase 9).
 * Same finished UI markers (`data-result` / `data-end-reason`) as resign/draw — Phases 6–7 helpers.
 */
test.describe('terminal finish — checkmate on board', () => {
  test.skip(!hasTwoUserE2ECredentials(), 'Set all four E2E_USER_* and E2E_USER_B_* env vars');
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  test("fool's mate: black checkmates; both see black_win + checkmate from persistMove path", async ({
    browser,
  }) => {
    const { pageA, pageB, gameId, dispose } = await setupAcceptedLiveChallenge(browser);
    try {
      await expect(pageA).toHaveURL(new RegExp(`/game/${gameId}`), { timeout: 45_000 });
      await expect(pageB).toHaveURL(new RegExp(`/game/${gameId}`), { timeout: 45_000 });
      await expect(pageA.getByTestId('game-board')).toBeVisible({ timeout: 20_000 });
      await expect(pageB.getByTestId('game-board')).toBeVisible({ timeout: 20_000 });

      await playFoolsMateCooperative(pageA, pageB);

      await expectFinishedParitySummary(pageB, { result: 'black_win', endReason: 'checkmate' });
      await expectFinishedParitySummary(
        pageA,
        { result: 'black_win', endReason: 'checkmate' },
        { bannerTimeoutMs: 45_000 }
      );
    } finally {
      await dispose();
    }
  });
});
