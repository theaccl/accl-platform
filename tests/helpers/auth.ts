import { expect, type Page } from '@playwright/test';

import { ROUTES } from '../fixtures/routes';

/**
 * Deterministic post-login shell: `lobby-ready` on **`/` (home)**, **`/modes`**, or **`/tester/welcome`** (matches
 * `router.replace` after sign-in). **`/free`** continues to rely on `free-lobby-root` when tests
 * navigate there explicitly — duplicating `lobby-ready` on every authenticated route is out of scope
 * for this batch. On **`/free`**, wait for `free-lobby-ready` (and `free-lobby-root`) after navigation.
 */
export async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto(ROUTES.login);
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL(
    (url) =>
      url.pathname === ROUTES.home || url.pathname === '/modes' || url.pathname === '/tester/welcome',
    {
      timeout: 30_000,
    },
  );
  await expect(page.getByTestId('lobby-ready')).toBeAttached({ timeout: 30_000 });
}
