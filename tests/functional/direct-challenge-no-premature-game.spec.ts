import { test, expect } from '@playwright/test';

import {
  hasE2ECredentials,
  hasTwoUserE2ECredentials,
  e2eUserBEmail,
  e2eUserBPassword,
  e2eUserEmail,
  e2eUserPassword,
} from '../fixtures/env';
import { ROUTES } from '../fixtures/routes';
import { loginAs } from '../helpers/auth';
import { expectNoGhostReadyBanner } from '../helpers/freePlayAsserts';
import { sendPendingLiveChallengeFromFree } from '../helpers/liveChallengePair';

test.describe('direct challenge — no game before accept', () => {
  test.skip(!hasTwoUserE2ECredentials(), 'Set all four E2E_USER_* and E2E_USER_B_* env vars');
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test('sender stays off /game/:id until opponent accepts; recipient sees notification surfaces', async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    try {
      await loginAs(pageA, e2eUserEmail()!, e2eUserPassword()!);
      await loginAs(pageB, e2eUserBEmail()!, e2eUserBPassword()!);

      await sendPendingLiveChallengeFromFree(pageA);
      await expect(pageA).toHaveURL(/\/free/);
      expect(pageA.url()).not.toMatch(/\/game\/[a-f0-9-]+/i);
      await new Promise((r) => setTimeout(r, 2500));
      await expect(pageA).toHaveURL(/\/free/);
      expect(pageA.url()).not.toMatch(/\/game\/[a-f0-9-]+/i);

      await pageB.goto(ROUTES.home);
      await expect(pageB.getByTestId('home-lobby-root')).toBeVisible({ timeout: 15_000 });
      await expect(pageB.getByTestId('pending-match-requests-banner')).toBeVisible({ timeout: 25_000 });

      await pageB.goto(ROUTES.requests);
      await expect(pageB.getByTestId('requests-inbox-root')).toBeVisible({ timeout: 15_000 });
      await expect(pageB.locator('[data-testid^="incoming-request-card-"]').first()).toBeVisible({
        timeout: 25_000,
      });
      await expect(pageB.locator('[data-testid^="incoming-request-seat-"]').first()).toBeVisible({
        timeout: 10_000,
      });
      await expect(pageB.locator('[data-testid^="incoming-request-seat-"]').first()).toContainText(
        /White/i
      );
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('recipient free lobby lists incoming challenge without manual reload (realtime/poll)', async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    try {
      await loginAs(pageA, e2eUserEmail()!, e2eUserPassword()!);
      await loginAs(pageB, e2eUserBEmail()!, e2eUserBPassword()!);

      await pageB.goto(ROUTES.free);
      await expect(pageB.getByTestId('free-lobby-root')).toBeVisible({ timeout: 30_000 });

      await sendPendingLiveChallengeFromFree(pageA);

      await expect(pageB.locator('[data-testid^="free-incoming-request-"]').first()).toBeVisible({
        timeout: 25_000,
      });
      await expectNoGhostReadyBanner(pageB);
      await expect(pageB.getByText('INCOMING REQUEST')).toBeVisible();
      await expect(pageB.getByText('WAITING FOR OPPONENT')).not.toBeVisible();
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });

  test('home lobby exposes direct challenge tempo and color controls', async ({ page }) => {
    test.skip(!hasE2ECredentials(), 'Set E2E_USER_EMAIL and E2E_USER_PASSWORD');
    await loginAs(page, e2eUserEmail()!, e2eUserPassword()!);
    await page.goto(ROUTES.home);
    await expect(page.getByTestId('direct-challenge-panel')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#direct-challenge-home-tempo')).toBeVisible();
    await expect(page.locator('#direct-challenge-home-color')).toBeVisible();
  });
});
