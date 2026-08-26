import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { mountComparisonPanel } from '../helpers/mountComparisonPage';

const FREE_CATEGORY_IDS = [
  'landscape-ticker-category-accl',
  'landscape-ticker-category-tournament',
  'landscape-ticker-category-bullet',
  'landscape-ticker-category-blitz',
  'landscape-ticker-category-rapid',
  'landscape-ticker-category-daily',
];

const TIME_CONTROL_IDS = [
  'rating-lane-tab-day',
  'rating-lane-tab-week',
  'rating-lane-tab-month',
  'rating-lane-tab-year',
  'rating-lane-tab-overall',
];

function captureDir(testInfo: TestInfo): string {
  const raw = process.env.COMPACT_COMPARISON_CAPTURE_DIR?.trim() || process.env.LANDSCAPE_TICKER_CAPTURE_DIR?.trim();
  const dest =
    raw && raw !== '1' && raw.toLowerCase() !== 'true' && raw !== 'playwright-output'
      ? raw
      : join(process.env.USERPROFILE ?? process.cwd(), 'accl-ticker-017-audit', 'actual-component');
  mkdirSync(dest, { recursive: true });
  void testInfo;
  return dest;
}

async function mountCompareMajorRatings(page: Page, viewport: { width: number; height: number }) {
  await page.clock.install({ time: new Date('2026-08-30T12:00:00Z') });
  await mountComparisonPanel(page, { crossing: true, viewport });
  await page.getByTestId('comparison-lane-tab-overall').click();
  await page.getByTestId('rating-family-comparison-panel').waitFor();
}

async function clickCompareMajorRatingsExpand(page: Page) {
  const expand = page.getByTestId('rating-comparison-expand-mobile');
  await expect(expand).toBeVisible();
  await expand.click();
  await page.getByTestId('expanded-rating-ticker-drawer').waitFor();
}

async function assertCleanLandscapeFromComparison(page: Page) {
  const drawer = page.getByTestId('expanded-rating-ticker-drawer');
  await expect(drawer).toBeVisible();
  await expect(page.getByTestId('expanded-rating-comparison-drawer')).toHaveCount(0);
  await expect(page.getByTestId('landscape-ticker-family-free')).toBeVisible();
  await expect(page.getByTestId('landscape-ticker-family-battlefield')).toBeVisible();
  await expect(page.getByTestId('landscape-ticker-family-kptv')).toBeVisible();
  await expect(page.getByTestId('landscape-ticker-category-controls')).toBeVisible();
  for (const id of FREE_CATEGORY_IDS) {
    await expect(page.getByTestId(id)).toBeVisible();
    await expect(page.getByTestId(id)).toHaveAttribute('data-selected', 'false');
  }
  for (const id of TIME_CONTROL_IDS) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  await expect(page.getByTestId('expanded-ticker-close')).toBeVisible();
  await expect(drawer).toHaveAttribute('data-selected-count', '0');
  await expect(drawer).toHaveAttribute('data-dominance-order', 'none');
  await expect(page.getByTestId('landscape-ticker-chart')).toHaveAttribute('data-empty-open', 'true');
  await expect(page.locator('[data-testid^="landscape-ticker-path-"]')).toHaveCount(0);
}

test.describe('compare-major-ratings expand entry point', () => {
  test('Expand on Compare major ratings opens a clean landscape ticker', async ({ page }) => {
    await mountCompareMajorRatings(page, { width: 360, height: 800 });
    await expect(page.getByTestId('rating-family-comparison-panel')).toHaveAttribute(
      'data-dominance-order',
      'none',
    );
    await clickCompareMajorRatingsExpand(page);
    await assertCleanLandscapeFromComparison(page);
    const buttonOrder = await page
      .getByTestId('landscape-ticker-category-controls')
      .locator('button')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-testid')));
    expect(buttonOrder).toEqual(FREE_CATEGORY_IDS);
  });

  test('Blitz then Rapid from the comparison Expand become dominant and reopen empty', async ({
    page,
  }) => {
    await mountCompareMajorRatings(page, { width: 360, height: 800 });
    await clickCompareMajorRatingsExpand(page);
    await assertCleanLandscapeFromComparison(page);

    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.clock.fastForward(1800);
    await expect(page.getByTestId('landscape-ticker-path-free_blitz')).toHaveCount(1);
    await expect(page.getByTestId('expanded-rating-ticker-drawer')).toHaveAttribute(
      'data-dominance-order',
      'free_blitz',
    );

    await page.getByTestId('landscape-ticker-category-rapid').click();
    await page.clock.fastForward(1800);
    await expect(page.getByTestId('landscape-ticker-path-free_rapid')).toHaveCount(1);
    await expect(page.getByTestId('expanded-rating-ticker-drawer')).toHaveAttribute(
      'data-dominance-order',
      'free_blitz free_rapid',
    );
    await expect(page.getByTestId('landscape-ticker-path-free_rapid')).toHaveAttribute(
      'data-dominant',
      'true',
    );

    await page.getByTestId('landscape-ticker-category-rapid').click();
    await page.getByTestId('landscape-ticker-category-rapid').click();
    await page.clock.fastForward(1800);
    await expect(page.getByTestId('expanded-rating-ticker-drawer')).toHaveAttribute(
      'data-dominance-order',
      'free_blitz free_rapid',
    );
    await expect(page.getByTestId('landscape-ticker-path-free_rapid')).toHaveAttribute(
      'data-dominant',
      'true',
    );

    await page.getByTestId('expanded-ticker-close').click();
    await expect(page.getByTestId('expanded-rating-ticker-drawer')).toHaveCount(0);
    await clickCompareMajorRatingsExpand(page);
    await assertCleanLandscapeFromComparison(page);
    await expect(page.getByTestId('landscape-ticker-family-free')).toHaveAttribute(
      'data-selected',
      'true',
    );
  });

  test('before/after captures from the actual Compare-major-ratings Expand route', async ({
    page,
  }, testInfo) => {
    const dir = captureDir(testInfo);
    const shot = (name: string) => join(dir, name);

    await mountCompareMajorRatings(page, { width: 360, height: 800 });
    await page.screenshot({ path: shot('e01-before-expand-360x800.png'), fullPage: true });
    await clickCompareMajorRatingsExpand(page);
    await assertCleanLandscapeFromComparison(page);
    await page.screenshot({ path: shot('e02-after-expand-empty-360x800.png'), fullPage: true });

    await page.getByTestId('expanded-ticker-close').click();
    await page.setViewportSize({ width: 800, height: 360 });
    await page.screenshot({ path: shot('e03-before-expand-800x360.png'), fullPage: true });
    await clickCompareMajorRatingsExpand(page);
    await assertCleanLandscapeFromComparison(page);
    await page.screenshot({ path: shot('e04-after-expand-empty-800x360.png'), fullPage: true });

    await page.getByTestId('expanded-ticker-close').click();
    await page.setViewportSize({ width: 667, height: 375 });
    await page.screenshot({ path: shot('e05-before-expand-667x375.png'), fullPage: true });
    await clickCompareMajorRatingsExpand(page);
    await assertCleanLandscapeFromComparison(page);
    await page.screenshot({ path: shot('e06-after-expand-empty-667x375.png'), fullPage: true });
    expect(existsSync(shot('e01-before-expand-360x800.png'))).toBe(true);
    expect(existsSync(shot('e04-after-expand-empty-800x360.png'))).toBe(true);
    expect(existsSync(shot('e06-after-expand-empty-667x375.png'))).toBe(true);
  });
});
