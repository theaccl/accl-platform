import { test, expect } from '@playwright/test';

import {
  hasTwoUserE2ECredentials,
  e2eUserEmail,
  e2eUserPassword,
} from '../fixtures/env';
import { ROUTES } from '../fixtures/routes';
import { loginAs } from '../helpers/auth';

/**
 * Home no longer offers immediate `games` insert vs a looked-up opponent (that bypassed match_requests).
 * Private invites use DirectChallengePanel only.
 */
test.describe('home — no duplicate opponent-invite path', () => {
  test.skip(!hasTwoUserE2ECredentials(), 'Set all four E2E_USER_* and E2E_USER_B_* env vars');
  test.describe.configure({ timeout: 60_000 });

  test('direct challenge panel present; legacy instant game vs opponent removed', async ({ page }) => {
    await loginAs(page, e2eUserEmail()!, e2eUserPassword()!);
    await page.goto(ROUTES.home);

    await expect(page.getByTestId('direct-challenge-panel')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Create game vs opponent' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Look up by email' })).toHaveCount(0);
  });
});
