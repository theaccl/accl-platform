import { test, expect } from '@playwright/test';

import { hasTwoUserE2ECredentials } from '../fixtures/env';
import { setupAcceptedLiveChallenge } from '../helpers/liveChallengePair';

/** After decline, game stays active and a new draw can be offered. */
test.describe('draw offer — decline', () => {
  test.skip(!hasTwoUserE2ECredentials(), 'Set all four E2E_USER_* and E2E_USER_B_* env vars');
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test('white offers, black declines; game stays active', async ({ browser }) => {
    const { pageA, pageB, gameId, dispose } = await setupAcceptedLiveChallenge(browser);
    try {
      await expect(pageA).toHaveURL(new RegExp(`/game/${gameId}`), { timeout: 45_000 });
      await expect(pageB).toHaveURL(new RegExp(`/game/${gameId}`), { timeout: 45_000 });

      await expect(pageA.getByTestId('offer-draw-button')).toBeVisible({ timeout: 25_000 });
      await pageA.getByTestId('offer-draw-button').click();

      await expect(pageB.getByTestId('draw-decline-button')).toBeVisible({ timeout: 20_000 });
      await pageB.getByTestId('draw-decline-button').click();

      await expect(pageB.getByTestId('game-row-status')).toContainText('active', { timeout: 20_000 });
      await expect(pageB.getByTestId('game-over-banner')).toHaveCount(0);

      await expect(pageA.getByTestId('draw-offer-banner')).toHaveCount(0, { timeout: 25_000 });
      await expect(pageA.getByTestId('offer-draw-button')).toBeVisible({ timeout: 25_000 });
      await expect(pageA.getByTestId('game-row-status')).toContainText('active');
    } finally {
      await dispose();
    }
  });
});
