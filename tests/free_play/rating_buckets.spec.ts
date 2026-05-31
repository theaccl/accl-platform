import { test, expect, type Page } from '@playwright/test';

import { hasTwoUserE2ECredentials } from '../fixtures/env';
import { expectFinishedParitySummary } from '../helpers/finishedGameUi';
import { setupAcceptedFreeDirectChallenge } from '../helpers/freeRatedChallengePair';

async function expectFinishedRatingSummaryVisible(page: Page): Promise<void> {
  await expect(page.getByTestId('finished-game-rating-summary')).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId('finished-game-rating-mode-line')).toBeVisible();
  await expect(page.getByTestId('rating-update-debug')).toHaveCount(0);
}

test.describe('rating segregation (free-play buckets)', () => {
  test.skip(!hasTwoUserE2ECredentials(), 'Set all four E2E_USER_* and E2E_USER_B_* env vars');
  test.describe.configure({ mode: 'serial', timeout: 200_000 });

  test('free live rated finished → human summary with white and black deltas', async ({
    browser,
  }) => {
    const { pageA, pageB, dispose } = await setupAcceptedFreeDirectChallenge(browser, {
      rated: true,
      tempo: 'live',
    });
    try {
      await expect(pageB.getByTestId('resign-button')).toBeVisible({ timeout: 25_000 });
      await pageB.getByTestId('resign-button').click();
      await expectFinishedParitySummary(pageA, { result: 'black_win', endReason: 'resign' }, { bannerTimeoutMs: 45_000 });

      await expectFinishedRatingSummaryVisible(pageA);
      await expect(pageA.getByTestId('finished-game-rating-mode-line')).toContainText('Rated');
      await expect(pageA.getByTestId('finished-game-rating-white-line')).toBeVisible();
      await expect(pageA.getByTestId('finished-game-rating-black-line')).toBeVisible();
    } finally {
      await dispose();
    }
  });

  test('free live unrated finished → summary note; no raw JSON debug', async ({
    browser,
  }) => {
    const { pageA, pageB, dispose } = await setupAcceptedFreeDirectChallenge(browser, {
      rated: false,
      tempo: 'live',
    });
    try {
      await expect(pageB.getByTestId('resign-button')).toBeVisible({ timeout: 25_000 });
      await pageB.getByTestId('resign-button').click();
      await expectFinishedParitySummary(pageA, { result: 'black_win', endReason: 'resign' }, { bannerTimeoutMs: 45_000 });

      await expectFinishedRatingSummaryVisible(pageA);
      await expect(pageA.getByTestId('finished-game-rating-note')).toContainText(/Unrated/i);
    } finally {
      await dispose();
    }
  });

  test('free daily rated finished → summary visible with rated mode line', async ({ browser }) => {
    const { pageA, pageB, dispose } = await setupAcceptedFreeDirectChallenge(browser, {
      rated: true,
      tempo: 'daily',
    });
    try {
      await expect(pageB.getByTestId('resign-button')).toBeVisible({ timeout: 25_000 });
      await pageB.getByTestId('resign-button').click();
      await expectFinishedParitySummary(pageA, { result: 'black_win', endReason: 'resign' }, { bannerTimeoutMs: 45_000 });

      await expectFinishedRatingSummaryVisible(pageA);
      await expect(pageA.getByTestId('finished-game-rating-mode-line')).toContainText('Rated');
    } finally {
      await dispose();
    }
  });

  test('free correspondence rated finished → summary visible with rated mode line', async ({
    browser,
  }) => {
    const { pageA, pageB, dispose } = await setupAcceptedFreeDirectChallenge(browser, {
      rated: true,
      tempo: 'correspondence',
    });
    try {
      await expect(pageB.getByTestId('resign-button')).toBeVisible({ timeout: 25_000 });
      await pageB.getByTestId('resign-button').click();
      await expectFinishedParitySummary(pageA, { result: 'black_win', endReason: 'resign' }, { bannerTimeoutMs: 45_000 });

      await expectFinishedRatingSummaryVisible(pageA);
      await expect(pageA.getByTestId('finished-game-rating-mode-line')).toContainText('Rated');
    } finally {
      await dispose();
    }
  });
});
