import { test, expect } from '@playwright/test';

import { hasTwoUserE2ECredentials } from '../fixtures/env';
import { playOpeningE2E4 } from '../helpers/board';
import { expectFinishedParitySummary } from '../helpers/finishedGameUi';
import { setupAcceptedLiveChallenge } from '../helpers/liveChallengePair';

/**
 * Draw by agreement: white (A) offers, black (B) accepts.
 * Accept path uses `finish_game` RPC (same params as `app/page.tsx` `finishAsDraw`) — Phase 6.
 */
test.describe('end state — draw agreement', () => {
  test.skip(!hasTwoUserE2ECredentials(), 'Set all four E2E_USER_* and E2E_USER_B_* env vars');
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test('white offers draw, black accepts; both finished; moves do not reopen play', async ({
    browser,
  }) => {
    const { pageA, pageB, gameId, dispose } = await setupAcceptedLiveChallenge(browser);
    try {
      await expect(pageA).toHaveURL(new RegExp(`/game/${gameId}`), { timeout: 45_000 });
      await expect(pageB).toHaveURL(new RegExp(`/game/${gameId}`), { timeout: 45_000 });

      await expect(pageA.getByTestId('offer-draw-button')).toBeVisible({ timeout: 25_000 });
      await pageA.getByTestId('offer-draw-button').click();

      await expect(pageB.getByTestId('draw-offer-banner')).toBeVisible({ timeout: 20_000 });
      await expect(pageB.getByTestId('draw-accept-button')).toBeVisible({ timeout: 15_000 });
      await pageB.getByTestId('draw-accept-button').click();

      await expectFinishedParitySummary(pageB, { result: 'draw', endReason: 'draw_agreement' });
      await expect(pageB.getByTestId('game-over-banner')).toContainText(/draw/i, {
        timeout: 5_000,
      });

      await expectFinishedParitySummary(
        pageA,
        { result: 'draw', endReason: 'draw_agreement' },
        { bannerTimeoutMs: 45_000 }
      );

      await playOpeningE2E4(pageA);
      await expect(pageA.getByTestId('offer-draw-button')).toHaveCount(0);
      await expect(pageA.getByTestId('game-row-status')).toContainText('finished');
    } finally {
      await dispose();
    }
  });
});
