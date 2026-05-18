import { expect, test } from '@playwright/test';

import { hasE2ECredentials, e2eUserEmail, e2eUserPassword } from '../fixtures/env';
import { loginAs } from '../helpers/auth';

test.describe('Free lobby Play Computer (rendered)', () => {
  test.skip(!hasE2ECredentials(), 'Set E2E_USER_EMAIL and E2E_USER_PASSWORD');

  test.beforeEach(async ({ page }) => {
    await loginAs(page, e2eUserEmail()!, e2eUserPassword()!);
  });

  test('blitz mode room shows Play Computer panel', async ({ page }) => {
    await page.goto('/free/lobby/blitz');
    await expect(page.getByTestId('free-lobby-root')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('free-lobby-mode-room-blitz')).toBeVisible();
    await expect(page.getByTestId('free-lobby-mode-room-blitz')).toHaveAttribute(
      'data-computer-play-enabled',
      'true',
    );
    const panel = page.getByTestId('free-lobby-play-computer-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Play computer');
    await expect(page.getByTestId('free-lobby-play-computer-start-blitz')).toBeVisible();
  });

  test('rapid mode room shows Play Computer panel', async ({ page }) => {
    await page.goto('/free/lobby/rapid');
    await expect(page.getByTestId('free-lobby-play-computer-panel')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('free-lobby-mode-room-rapid')).toHaveAttribute(
      'data-computer-play-enabled',
      'true',
    );
  });

  test('bullet mode room shows Play Computer panel', async ({ page }) => {
    await page.goto('/free/lobby/bullet');
    await expect(page.getByTestId('free-lobby-play-computer-panel')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('free-lobby-play-computer-tc-bullet-1m')).toBeVisible();
  });

  test('daily mode room does not show Play Computer panel', async ({ page }) => {
    await page.goto('/free/lobby/daily');
    await expect(page.getByTestId('free-lobby-mode-room-daily')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('free-lobby-mode-room-daily')).toHaveAttribute(
      'data-computer-play-enabled',
      'false',
    );
    await expect(page.getByTestId('free-lobby-play-computer-panel')).toHaveCount(0);
  });
});
