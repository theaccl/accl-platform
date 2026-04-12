import { test, expect } from '@playwright/test';

import { ROUTES } from '../fixtures/routes';

test.describe('smoke load', () => {
  test('login route renders auth controls', async ({ page }) => {
    await page.goto(ROUTES.login);
    await expect(page.getByTestId('login-email')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('login-password')).toBeVisible();
    await expect(page.getByTestId('login-submit')).toBeVisible();
  });

  test('home shell responds without auth', async ({ page }) => {
    await page.goto(ROUTES.home);
    await expect(page.getByTestId('home-lobby-root')).toBeVisible({ timeout: 30_000 });
  });
});
