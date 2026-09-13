import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { mountComparisonPanel } from '../helpers/mountComparisonPage';

test('ACCL ticker adds real major-family series and keeps Expand reachable', async ({ page }) => {
  await mountComparisonPanel(page, {
    single: true,
    accl: true,
    viewport: { width: 1280, height: 720 },
  });

  await expect(page.getByTestId('accl-ticker-major-family-options')).toBeVisible();
  await expect(page.locator('[data-testid^="accl-ticker-option-"]')).toHaveCount(5);
  await expect(page.getByTestId('rating-ticker-expand-mobile')).toBeVisible();

  await page.getByTestId('accl-ticker-option-free_rapid').click();
  await expect(page.getByTestId('accl-ticker-option-free_rapid')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('multi-line-rating-chart')).toHaveAttribute(
    'data-dominance-order',
    'accl free_rapid',
  );
  await expect(page.getByTestId('multi-line-series-accl')).toHaveCount(1);
  await expect(page.getByTestId('multi-line-series-free_rapid')).toHaveCount(1);
  await expect(page.locator('[data-testid^="multi-line-point-"]')).toHaveCount(0);

  await page.getByTestId('rating-lane-tab-overall').click();
  await expect(page.locator('[data-testid^="multi-line-point-"]')).not.toHaveCount(0);

  await page.getByTestId('rating-ticker-expand-mobile').click();
  await expect(page.getByTestId('expanded-rating-ticker-drawer')).toBeVisible();
});

test('ticker ratings render plain digits without thousands separators', async ({ page }) => {
  await mountComparisonPanel(page, { viewport: { width: 800, height: 600 } });
  await page.getByTestId('major-family-legend-rapid').click();
  await page.getByTestId('comparison-lane-tab-overall').click();
  await page.getByTestId('multi-line-point-free_rapid').hover();
  await expect(page.getByTestId('multi-line-hover-tooltip')).toContainText('1499');
  await expect(page.getByTestId('multi-line-hover-tooltip')).not.toContainText('1,499');
  expect(
    readFileSync(
      join(process.cwd(), 'components/profile/ratings/MultiLineRatingTickerChart.tsx'),
      'utf8',
    ),
  ).not.toContain('ratingAfter.toLocaleString');
});
