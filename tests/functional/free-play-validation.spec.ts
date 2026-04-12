import { test, expect } from '@playwright/test';

import {
  e2eUserBEmail,
  e2eUserBPassword,
  e2eUserEmail,
  e2eUserPassword,
  hasTwoUserE2ECredentials,
} from '../fixtures/env';
import { ROUTES } from '../fixtures/routes';
import { loginAs } from '../helpers/auth';
import { expectNoGhostReadyBanner } from '../helpers/freePlayAsserts';
import { gameIdFromUrl } from '../helpers/gameUrl';

/**
 * Single serial flow avoids DB cross-talk: later steps assume the paired game from earlier steps.
 * Covers random match UI, Find Match guard, then pending outgoing + seated primary messaging.
 */
test.describe('free-play validation (two users)', () => {
  test.skip(!hasTwoUserE2ECredentials(), 'Set E2E_USER_EMAIL, E2E_USER_PASSWORD, E2E_USER_B_EMAIL, E2E_USER_B_PASSWORD');
  test.describe.configure({ timeout: 240_000 });

  test('random match, guard redirect, then outgoing invite while at primary table', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    try {
      await loginAs(pageA, e2eUserEmail()!, e2eUserPassword()!);
      await loginAs(pageB, e2eUserBEmail()!, e2eUserBPassword()!);

      // --- Random match: open seat, pair, primary strip ---
      await pageA.goto(ROUTES.free);
      await expect(pageA.getByTestId('free-lobby-root')).toBeVisible();
      await pageA.getByTestId('free-find-match').first().click();
      await pageA.waitForURL((u) => u.pathname.startsWith('/game/'), { timeout: 45_000 });
      const gameId = gameIdFromUrl(pageA.url());

      await pageA.goto(ROUTES.free);
      await expectNoGhostReadyBanner(pageA);
      await expect(pageA.getByTestId('free-primary-game')).toHaveCount(0);
      await expect(pageA.getByText('WAITING FOR OPPONENT')).toBeVisible({ timeout: 25_000 });
      await expect(pageA.locator(`[data-active-game-id="${gameId}"]`)).toBeVisible();

      await pageB.goto(ROUTES.free);
      await pageB.getByTestId('free-find-match').first().click();
      await pageB.waitForURL((u) => u.pathname.startsWith('/game/'), { timeout: 45_000 });
      expect(gameIdFromUrl(pageB.url())).toBe(gameId);

      await pageA.goto(ROUTES.free);
      await pageA.reload();
      await expectNoGhostReadyBanner(pageA);
      await expect(pageA.getByTestId('free-primary-game')).toBeVisible({ timeout: 25_000 });
      await expect(pageA.getByTestId('free-primary-game')).toContainText(gameId.slice(0, 8));
      await expect(pageA.locator(`[data-testid="free-active-game-row-${gameId}"]`)).toHaveCount(0);

      await pageB.goto(ROUTES.free);
      await pageB.reload();
      await expectNoGhostReadyBanner(pageB);
      await expect(pageB.getByTestId('free-primary-game')).toBeVisible({ timeout: 25_000 });

      // --- Find Match guard: still routes to same table ---
      await pageA.goto(ROUTES.free);
      await expect(pageA.getByTestId('free-primary-game')).toBeVisible({ timeout: 25_000 });
      await pageA.getByTestId('free-find-match').first().click();
      await pageA.waitForURL((u) => u.pathname.startsWith('/game/'), { timeout: 15_000 });
      expect(gameIdFromUrl(pageA.url())).toBe(gameId);

      await pageA.goto(ROUTES.free);
      await expect(pageA.getByTestId('free-primary-game')).toHaveCount(1);

      // --- Pending direct challenge while already seated: outgoing clarifies vs current table ---
      await pageA.goto(ROUTES.free);
      await pageA.getByRole('button', { name: '5 min' }).click();
      await pageA.getByLabel(/Your color/i).selectOption('white');
      await pageA.getByTestId('challenge-opponent-lookup').fill(e2eUserBEmail()!);
      await pageA.getByTestId('challenge-find-opponent').click();
      await expect(pageA.getByText('OPPONENT FOUND', { exact: false })).toBeVisible({ timeout: 25_000 });
      await pageA.getByTestId('challenge-send-submit').click();
      await expect(pageA.getByTestId('challenge-sent-awaiting')).toBeVisible({ timeout: 20_000 });

      await pageA.goto(ROUTES.free);
      await pageA.reload();
      await expect(pageA.getByTestId('free-primary-game')).toBeVisible({ timeout: 25_000 });
      const outgoingRows = pageA
        .getByTestId('free-outgoing-section')
        .locator('[data-testid^="free-outgoing-request-"]');
      await expect(outgoingRows.first()).toBeVisible({ timeout: 25_000 });
      await expect(
        pageA.getByTestId('free-outgoing-section').getByText(/Not your current table/i)
      ).toBeVisible();
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
