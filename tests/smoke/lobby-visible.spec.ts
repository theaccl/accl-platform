import { test, expect } from '@playwright/test';

import { hasE2ECredentials, e2eUserEmail, e2eUserPassword } from '../fixtures/env';
import { ROUTES } from '../fixtures/routes';
import { loginAs } from '../helpers/auth';

test.describe('lobby visibility (authenticated)', () => {
  test.skip(!hasE2ECredentials(), 'Set E2E_USER_EMAIL and E2E_USER_PASSWORD');

  test.beforeEach(async ({ page }) => {
    await loginAs(page, e2eUserEmail()!, e2eUserPassword()!);
  });

  test('home lobby root is visible after login', async ({ page }) => {
    await page.goto(ROUTES.home);
    await expect(page.getByTestId('home-lobby-root')).toBeVisible({ timeout: 30_000 });
  });

  test('free lobby shows root, challenge panel, find match', async ({ page }) => {
    await page.goto(ROUTES.free);
    await expect(page.getByTestId('free-lobby-root')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('free-lobby-ready')).toBeAttached();
    await expect(page.getByTestId('free-active-games-section')).toBeVisible();
    await expect(page.getByTestId('direct-challenge-panel')).toBeVisible();
    await expect(page.getByTestId('free-find-match').first()).toBeVisible();
  });
});
