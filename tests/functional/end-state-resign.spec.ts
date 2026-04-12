import { test, expect } from '@playwright/test';

import { hasTwoUserE2ECredentials } from '../fixtures/env';
import { playOpeningE2E4 } from '../helpers/board';
import { expectFinishedParitySummary } from '../helpers/finishedGameUi';
import { setupAcceptedLiveChallenge } from '../helpers/liveChallengePair';

/**
 * Black (user B) resigns → `finish_game` RPC; both clients should show finished UI and drop in-game actions.
 * Move attempts after finish must not reopen play (client `canPlayMoves` is false when `status === 'finished'`).
 */
test.describe('end state — resign and move lock', () => {
  test.skip(!hasTwoUserE2ECredentials(), 'Set all four E2E_USER_* and E2E_USER_B_* env vars');
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test('black resigns; both see finished; resign CTA gone; board play does not change status', async ({
    browser,
  }) => {
    const { pageA, pageB, gameId, dispose } = await setupAcceptedLiveChallenge(browser);
    try {
      await expect(pageA).toHaveURL(new RegExp(`/game/${gameId}`), { timeout: 45_000 });
      await expect(pageA.getByTestId('resign-button')).toBeVisible({ timeout: 25_000 });
      await expect(pageB.getByTestId('resign-button')).toBeVisible({ timeout: 25_000 });

      await pageB.getByTestId('resign-button').click();

      await expectFinishedParitySummary(pageB, { result: 'black_win', endReason: 'resign' });

      await expectFinishedParitySummary(
        pageA,
        { result: 'black_win', endReason: 'resign' },
        { bannerTimeoutMs: 45_000 }
      );

      await playOpeningE2E4(pageA);
      await expect(pageA.getByTestId('game-row-status')).toContainText('finished');
    } finally {
      await dispose();
    }
  });
});
