import { test, expect, type Page } from '@playwright/test';

import { hasTwoUserE2ECredentials } from '../fixtures/env';
import { expectFinishedParitySummary } from '../helpers/finishedGameUi';
import { setupAcceptedFreeDirectChallenge } from '../helpers/freeRatedChallengePair';

const FREE_BUCKET_RE = /^(free_live|free_daily|free_correspondence)$/;

async function expectRatingSegregationOnFinishedPage(page: Page): Promise<void> {
  const row = page.getByTestId('rating-classification-debug');
  await expect(row).toBeVisible({ timeout: 25_000 });
  await expect(row).toHaveAttribute('data-rating-play-context', 'free');
  await expect(row).toHaveAttribute('data-rating-bucket', FREE_BUCKET_RE);
}

test.describe('rating segregation (free-play buckets)', () => {
  test.skip(!hasTwoUserE2ECredentials(), 'Set all four E2E_USER_* and E2E_USER_B_* env vars');
  test.describe.configure({ mode: 'serial', timeout: 200_000 });

  test('free live rated finished → classification maps to free_live; immediate; not tournament', async ({
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

      const dbg = pageA.getByTestId('rating-classification-debug');
      await expectRatingSegregationOnFinishedPage(pageA);
      await expect(dbg).toHaveAttribute('data-rating-bucket', 'free_live');
      await expect(dbg).toHaveAttribute('data-rating-update-timing', 'immediate');
      await expect(dbg).toHaveAttribute('data-rating-skip-reason', '');
      await expect(dbg).toHaveAttribute('data-rating-pace', 'live');
      await expect(dbg).toHaveAttribute('data-rating-white-eligible', 'true');
      await expect(dbg).toHaveAttribute('data-rating-black-eligible', 'true');
    } finally {
      await dispose();
    }
  });

  test('free live unrated finished → no rating eligibility; skipReason unrated; still free context', async ({
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

      const dbg = pageA.getByTestId('rating-classification-debug');
      await expectRatingSegregationOnFinishedPage(pageA);
      await expect(dbg).toHaveAttribute('data-rating-update-timing', 'none');
      await expect(dbg).toHaveAttribute('data-rating-skip-reason', 'unrated');
      await expect(dbg).toHaveAttribute('data-rating-white-eligible', 'false');
      await expect(dbg).toHaveAttribute('data-rating-black-eligible', 'false');
      await expect(dbg).toHaveAttribute('data-rating-pace', 'live');
      await expect(pageA.getByTestId('rating-update-debug')).toContainText('No rating snapshot', {
        timeout: 15_000,
      });
    } finally {
      await dispose();
    }
  });

  test('free daily rated finished → classification maps to free_daily', async ({ browser }) => {
    const { pageA, pageB, dispose } = await setupAcceptedFreeDirectChallenge(browser, {
      rated: true,
      tempo: 'daily',
    });
    try {
      await expect(pageB.getByTestId('resign-button')).toBeVisible({ timeout: 25_000 });
      await pageB.getByTestId('resign-button').click();
      await expectFinishedParitySummary(pageA, { result: 'black_win', endReason: 'resign' }, { bannerTimeoutMs: 45_000 });

      const dbg = pageA.getByTestId('rating-classification-debug');
      await expectRatingSegregationOnFinishedPage(pageA);
      await expect(dbg).toHaveAttribute('data-rating-bucket', 'free_daily');
      await expect(dbg).toHaveAttribute('data-rating-pace', 'daily');
      await expect(dbg).toHaveAttribute('data-rating-update-timing', 'immediate');
    } finally {
      await dispose();
    }
  });

  test('free correspondence rated finished → classification maps to free_correspondence', async ({ browser }) => {
    const { pageA, pageB, dispose } = await setupAcceptedFreeDirectChallenge(browser, {
      rated: true,
      tempo: 'correspondence',
    });
    try {
      await expect(pageB.getByTestId('resign-button')).toBeVisible({ timeout: 25_000 });
      await pageB.getByTestId('resign-button').click();
      await expectFinishedParitySummary(pageA, { result: 'black_win', endReason: 'resign' }, { bannerTimeoutMs: 45_000 });

      const dbg = pageA.getByTestId('rating-classification-debug');
      await expectRatingSegregationOnFinishedPage(pageA);
      await expect(dbg).toHaveAttribute('data-rating-bucket', 'free_correspondence');
      await expect(dbg).toHaveAttribute('data-rating-pace', 'correspondence');
      await expect(dbg).toHaveAttribute('data-rating-update-timing', 'immediate');
    } finally {
      await dispose();
    }
  });
});
