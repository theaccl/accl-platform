import fs from 'node:fs/promises';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

import { MODERATOR_AUTH_STATE_PATH, NON_MODERATOR_AUTH_STATE_PATH } from '../fixtures/authState';
import {
  requireModeratorE2EEnv,
  validateModeratorRoleExpectations,
} from '../helpers/moderatorE2EGuard';
import { ROUTES } from '../fixtures/routes';

async function resetClientAuthState(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.goto(ROUTES.login);
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

async function assertLoginFormReady(page: Page): Promise<void> {
  await page.goto(ROUTES.login);
  await page.waitForLoadState('domcontentloaded');
  const path = new URL(page.url()).pathname;
  if (path !== ROUTES.login) {
    throw new Error(
      `Expected login route "${ROUTES.login}" during auth setup, but landed on "${path}". Ensure auth state is cleared before login.`
    );
  }

  const emailInput = page.getByTestId('login-email');
  const passwordInput = page.getByTestId('login-password');
  const submitButton = page.getByTestId('login-submit');
  await expect(emailInput).toBeVisible({ timeout: 30_000 });
  await expect(passwordInput).toBeVisible({ timeout: 30_000 });
  await expect(submitButton).toBeVisible({ timeout: 30_000 });
}

async function mirrorSupabaseSessionToCookie(page: Page): Promise<void> {
  const sessionEntry = await page.evaluate(() => {
    const key = Object.keys(window.localStorage).find((entry) => /^sb-.*-auth-token$/.test(entry));
    if (!key) return null;
    const value = window.localStorage.getItem(key);
    if (!value) return null;
    return { key, value };
  });

  if (!sessionEntry) return;
  const url = new URL(page.url());
  await page.context().addCookies([
    {
      name: sessionEntry.key,
      value: sessionEntry.value,
      domain: url.hostname,
      path: '/',
      httpOnly: false,
      secure: url.protocol === 'https:',
      sameSite: 'Lax',
    },
  ]);
}

async function saveAuthStateForUser(input: {
  page: Page;
  email?: string;
  password?: string;
  outputPath: string;
}): Promise<void> {
  const parentDir = path.dirname(input.outputPath);
  await fs.mkdir(parentDir, { recursive: true });

  if (!input.email || !input.password) {
    await input.page.context().storageState({ path: input.outputPath });
    return;
  }

  await resetClientAuthState(input.page);
  await assertLoginFormReady(input.page);
  await input.page.getByTestId('login-email').fill(input.email);
  await input.page.getByTestId('login-password').fill(input.password);
  await input.page.getByTestId('login-submit').click();
  await input.page.waitForURL((url) => url.pathname === ROUTES.home || url.pathname === '/modes', {
    timeout: 30_000,
  });
  await expect(input.page.getByTestId('lobby-ready')).toBeAttached({ timeout: 30_000 });
  await mirrorSupabaseSessionToCookie(input.page);
  await input.page.context().storageState({ path: input.outputPath });
}

test('prepare auth storage states for moderator and non-moderator users', async ({ page }) => {
  const env = requireModeratorE2EEnv();
  await validateModeratorRoleExpectations(env);

  await saveAuthStateForUser({
    page,
    email: env.E2E_MODERATOR_EMAIL,
    password: env.E2E_MODERATOR_PASSWORD,
    outputPath: MODERATOR_AUTH_STATE_PATH,
  });

  await saveAuthStateForUser({
    page,
    email: env.E2E_NON_MODERATOR_EMAIL,
    password: env.E2E_NON_MODERATOR_PASSWORD,
    outputPath: NON_MODERATOR_AUTH_STATE_PATH,
  });
});
