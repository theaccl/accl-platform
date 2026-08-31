import { expect, test } from '@playwright/test';

test('Image Generator and Vault presentation render without browser errors', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/image-generator');
  await expect(page.getByRole('heading', { name: 'Create your chess identity' })).toBeVisible();
  await expect(page.getByText('Sovereign Atelier · private candidate studio')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  await expect(page.locator('[data-nextjs-dialog]')).toHaveCount(0);

  await page.goto('/vault');
  await expect(page.getByRole('heading', { name: 'ACCL Generation Tokens' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in to view Vault' })).toBeVisible();
  await expect(page.locator('[data-nextjs-dialog]')).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});
