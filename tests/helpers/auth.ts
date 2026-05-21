import { expect, type Page } from '@playwright/test';

import { ROUTES } from '../fixtures/routes';

function isPostLoginShellPath(pathname: string): boolean {
  return (
    pathname === ROUTES.home ||
    pathname === '/modes' ||
    pathname === '/tester/welcome' ||
    pathname === '/profile' ||
    pathname.startsWith('/profile/')
  );
}

/**
 * Post-login shell: home/modes/welcome (`lobby-ready`) or profile spine (`public-profile-root`).
 * **`/free`** uses `free-lobby-ready` after explicit navigation.
 */
export async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await page.goto(ROUTES.login);
  await page.getByTestId('login-email').fill(email);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await page.waitForURL((url) => isPostLoginShellPath(url.pathname), { timeout: 30_000 });
  await expect(
    page.getByTestId('lobby-ready').or(page.getByTestId('public-profile-root')),
  ).toBeAttached({ timeout: 30_000 });
}
