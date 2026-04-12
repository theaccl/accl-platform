import { test, expect } from '@playwright/test';

import {
  hasE2ECredentials,
  hasTwoUserE2ECredentials,
  e2eUserEmail,
  e2eUserPassword,
  e2eUserBEmail,
  e2eUserBPassword,
} from '../fixtures/env';
import { ROUTES } from '../fixtures/routes';
import { loginAs } from '../helpers/auth';
import { gameIdFromUrl, waitForGameUrl } from '../helpers/gameUrl';

/**
 * Recovery link should only surface games that are safe to open (both seats filled).
 * Solo open-seat rows must not appear — they led to confusing UX and clock/move gating bugs.
 */
test.describe('home active game recovery', () => {
  test.describe.configure({ timeout: 120_000 });

  test('solo open seat from home does not show recovery panel', async ({ page }) => {
    test.skip(!hasE2ECredentials(), 'Set E2E_USER_EMAIL and E2E_USER_PASSWORD');
    await loginAs(page, e2eUserEmail()!, e2eUserPassword()!);
    await page.goto(ROUTES.home);
    await page.getByTestId('home-find-match').click();
    await waitForGameUrl(page);

    await page.goto(ROUTES.home);
    await expect(page.getByTestId('home-active-game-recovery')).toHaveCount(0);
  });

  test('after both players join (home), return home shows recovery link', async ({ browser }) => {
    test.skip(!hasTwoUserE2ECredentials(), 'Set all four E2E_USER_* and E2E_USER_B_* env vars');

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    try {
      await loginAs(pageA, e2eUserEmail()!, e2eUserPassword()!);
      await loginAs(pageB, e2eUserBEmail()!, e2eUserBPassword()!);

      await pageA.goto(ROUTES.home);
      await pageB.goto(ROUTES.home);

      await pageA.getByTestId('home-find-match').click();
      await pageA.waitForURL((u) => u.pathname.startsWith('/game/'), { timeout: 45_000 });
      const gameId = gameIdFromUrl(pageA.url());

      await pageB.getByTestId('home-find-match').click();
      await pageB.waitForURL((u) => u.pathname.startsWith('/game/'), { timeout: 45_000 });
      expect(gameIdFromUrl(pageB.url())).toBe(gameId);

      await pageA.goto(ROUTES.home);
      await expect(pageA.getByTestId('home-active-game-recovery')).toBeVisible({ timeout: 25_000 });
      const recoveryLink = pageA.getByTestId('home-active-game-recovery').getByRole('link');
      await expect(recoveryLink).toHaveAttribute('href', `/game/${gameId}`);
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
