import { expect, unauthenticatedTest as test } from '../fixtures/moderatorAuthFixtures';

test('unauthenticated users are redirected away from moderator dashboard', async ({ page }) => {
  await page.goto('/moderator');
  await page.waitForURL('**/login');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});
