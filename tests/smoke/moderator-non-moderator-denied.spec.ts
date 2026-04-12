import { expect, nonModeratorTest as test } from '../fixtures/moderatorAuthFixtures';

test('authenticated non-moderator user is denied moderator dashboard access', async ({ page }) => {
  await page.goto('/moderator');
  await expect(page).toHaveURL(/\/modes$/);
  await expect(page.getByTestId('moderator-queue-root')).toHaveCount(0);
  await expect(page.getByTestId('moderator-enforcement-section')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Switch mode' })).toBeVisible({ timeout: 30_000 });
});
