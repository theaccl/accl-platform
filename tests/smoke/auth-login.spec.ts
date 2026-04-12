import { test, expect } from '@playwright/test';

import { e2eUserEmail, e2eUserPassword, hasE2ECredentials } from '../fixtures/env';
import { ROUTES } from '../fixtures/routes';
import { loginAs } from '../helpers/auth';

test.describe('login', () => {
  test('login page shows email field', async ({ page }) => {
    await page.goto(ROUTES.login);
    const vis = { timeout: 30_000 };
    await expect(page.getByTestId('login-email')).toBeVisible(vis);
    await expect(page.getByTestId('login-password')).toBeVisible(vis);
    await expect(page.getByTestId('login-submit')).toBeVisible(vis);
  });

  test('valid login reaches lobby-ready (home or modes)', async ({ page }) => {
    test.skip(!hasE2ECredentials(), 'Set E2E_USER_EMAIL and E2E_USER_PASSWORD');
    const email = e2eUserEmail()!;
    const password = e2eUserPassword()!;
    await loginAs(page, email, password);
    const path = new URL(page.url()).pathname;
    expect(path === '/' || path === '/modes').toBeTruthy();
    await expect(page.getByTestId('lobby-ready')).toBeAttached();
  });

  test('session collision: two isolated contexts may both sign in as the same user', async ({
    browser,
  }) => {
    test.skip(!hasE2ECredentials(), 'Set E2E_USER_EMAIL and E2E_USER_PASSWORD');
    const email = e2eUserEmail()!;
    const password = e2eUserPassword()!;
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();
    const page1 = await context1.newPage();
    const page2 = await context2.newPage();
    try {
      await loginAs(page1, email, password);
      await loginAs(page2, email, password);
      await expect(page1.getByTestId('lobby-ready')).toBeAttached();
      await expect(page2.getByTestId('lobby-ready')).toBeAttached();
      await page1.goto(ROUTES.home);
      await expect(page1.getByTestId('lobby-ready')).toBeAttached({ timeout: 20_000 });
    } finally {
      await context1.close();
      await context2.close();
    }
  });

  test('already authed: /login redirects away and exposes lobby-ready', async ({ browser }) => {
    test.skip(!hasE2ECredentials(), 'Set E2E_USER_EMAIL and E2E_USER_PASSWORD');
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await loginAs(page, e2eUserEmail()!, e2eUserPassword()!);
      await page.goto(ROUTES.login);
      await expect(page).toHaveURL(
        (u) => u.pathname === ROUTES.home || u.pathname === '/modes',
        { timeout: 30_000 }
      );
      await expect(page.getByTestId('lobby-ready')).toBeAttached({ timeout: 20_000 });
    } finally {
      await context.close();
    }
  });
});
