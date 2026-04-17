import { expect, test } from '@playwright/test';

import { e2eUserEmail, e2eUserPassword, hasE2ECredentials } from '../fixtures/env';
import { loginAs } from '../helpers/auth';

test.describe('profile edit — bio word count', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    test.skip(!hasE2ECredentials(), 'Set E2E_USER_EMAIL and E2E_USER_PASSWORD');
    await loginAs(page, e2eUserEmail()!, e2eUserPassword()!);
  });

  test('bio under 150 words shows inline error and does not save', async ({ page }) => {
    await page.goto('/profile/edit');
    await expect(page.getByTestId('edit-profile-form')).toBeVisible({ timeout: 30_000 });

    const usernameInput = page.getByTestId('edit-profile-username-input');
    if (await usernameInput.isEnabled()) {
      await usernameInput.fill(`e2e_bio_u_${Date.now()}`);
    }

    await page.getByTestId('edit-profile-bio-input').fill('word '.repeat(149));
    await page.getByTestId('edit-profile-save').click();
    await expect(page.getByTestId('edit-profile-bio-error')).toHaveText('Bio must be 150–250 words.');
    await expect(page.getByTestId('edit-profile-form-success')).toHaveCount(0);
  });

  test('bio over 250 words shows inline error and does not save', async ({ page }) => {
    await page.goto('/profile/edit');
    await expect(page.getByTestId('edit-profile-form')).toBeVisible({ timeout: 30_000 });

    const usernameInput = page.getByTestId('edit-profile-username-input');
    if (await usernameInput.isEnabled()) {
      await usernameInput.fill(`e2e_bio_o_${Date.now()}`);
    }

    await page.getByTestId('edit-profile-bio-input').fill('word '.repeat(251));
    await page.getByTestId('edit-profile-save').click();
    await expect(page.getByTestId('edit-profile-bio-error')).toHaveText('Bio must be 150–250 words.');
    await expect(page.getByTestId('edit-profile-form-success')).toHaveCount(0);
  });

  test('valid bio saves successfully', async ({ page }) => {
    await page.goto('/profile/edit');
    await expect(page.getByTestId('edit-profile-form')).toBeVisible({ timeout: 30_000 });

    const usernameInput = page.getByTestId('edit-profile-username-input');
    if (await usernameInput.isEnabled()) {
      await usernameInput.fill(`e2e_bio_ok_${Date.now()}`);
    }

    await page.getByTestId('edit-profile-bio-input').fill('word '.repeat(160));
    await page.getByTestId('edit-profile-save').click();
    await expect(page.getByTestId('edit-profile-form-success')).toHaveText('Profile updated.');
  });
});
