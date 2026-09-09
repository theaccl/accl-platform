import { expect, test } from '@playwright/test';

test('Image Generator and Vault presentation render without browser errors', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/image-generator');
  await expect(page.getByRole('heading', { name: 'Create your chess identity' })).toBeVisible();
  await expect(page.getByText('Sovereign Atelier · private candidate studio')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in', exact: true }).first()).toBeVisible();
  await expect(page.locator('[data-nextjs-dialog]')).toHaveCount(0);

  await page.goto('/vault');
  await expect(page.getByRole('heading', { name: 'ACCL Generation Tokens' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in to view Vault' })).toBeVisible();
  await expect(page.locator('[data-nextjs-dialog]')).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});

test('a signed-out private generation link never shows false generation progress', async ({ page }) => {
  await page.goto('/image-generator?generation=480a7a7c-f741-43d5-866d-cb2aa72fcf3e');

  await expect(page.getByRole('link', { name: 'Sign in', exact: true }).first()).toBeVisible();
  await expect(page.getByText('The atelier is creating')).toHaveCount(0);
  await expect(page.getByText(/Preparing \d+ private candidates/)).toHaveCount(0);
});
