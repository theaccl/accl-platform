import { test, expect } from '@playwright/test';

import { START_FEN } from '../../lib/startFen';
import {
  e2eUserEmail,
  e2eUserPassword,
  hasE2ECredentials,
  hasTwoUserE2ECredentials,
} from '../fixtures/env';
import { ROUTES } from '../fixtures/routes';
import { loginAs } from '../helpers/auth';
import { waitForGameUrl } from '../helpers/gameUrl';
import { setupAcceptedLiveChallenge } from '../helpers/liveChallengePair';

test.describe('startup contract (FEN + pre-start timing)', () => {
  test.describe.configure({ timeout: 120_000 });

  test('free open-seat creator: START_FEN and empty pre-move timing attrs', async ({ page }) => {
    test.skip(!hasE2ECredentials(), 'Set E2E_USER_EMAIL and E2E_USER_PASSWORD');
    await loginAs(page, e2eUserEmail()!, e2eUserPassword()!);
    await page.goto(ROUTES.free);
    await page.getByTestId('free-find-match').first().click();
    await waitForGameUrl(page);
    const snap = page.getByTestId('game-startup-snapshot');
    await expect(snap).toHaveAttribute('data-fen', START_FEN);
    await expect(snap).toHaveAttribute('data-last-move-at', '');
    await expect(snap).toHaveAttribute('data-move-deadline-at', '');
  });

  test('accepted live challenge: both land on game via realtime; snapshot matches contract', async ({
    browser,
  }) => {
    test.skip(!hasTwoUserE2ECredentials(), 'Set all four E2E_USER_* vars');
    const { pageA, pageB, gameId, dispose } = await setupAcceptedLiveChallenge(browser);
    try {
      await expect(pageB).toHaveURL(new RegExp(`/game/${gameId}`), { timeout: 45_000 });
      await expect(pageA).toHaveURL(new RegExp(`/game/${gameId}`), { timeout: 45_000 });

      for (const p of [pageA, pageB]) {
        const snap = p.getByTestId('game-startup-snapshot');
        await expect(snap).toHaveAttribute('data-fen', START_FEN, { timeout: 15_000 });
        await expect(snap).toHaveAttribute('data-last-move-at', '');
        await expect(snap).toHaveAttribute('data-move-deadline-at', '');
      }
    } finally {
      await dispose();
    }
  });
});
