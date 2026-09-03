import { expect, test, type Page } from '@playwright/test';

import { mountComparisonPanel } from '../helpers/mountComparisonPage';

const EXPECTED_CAPTIONS = {
  day: '2026 · Aug · ISO W34 · Fri 21 · UTC',
  week: '2026 · Aug · ISO W34 · UTC',
  month: '2026 · Aug · ISO W31–W34 · UTC',
  year: '2026 · Jan–Dec · UTC',
} as const;

async function capture(page: Page, filename: string) {
  if (!process.env.COMPACT_AXIS_CAPTURE_DIR) return;
  await page.waitForTimeout(250);
  await page.screenshot({
    path: `${process.env.COMPACT_AXIS_CAPTURE_DIR}/${filename}`,
    fullPage: true,
  });
}

async function assertLane(
  page: Page,
  prefix: 'rating' | 'comparison',
  chartTestId: 'rating-ticker-chart' | 'multi-line-rating-chart',
  axisPrefix: 'compact-rating' | 'compact-comparison',
  lane: keyof typeof EXPECTED_CAPTIONS,
) {
  await page.getByTestId(`${prefix}-lane-tab-${lane}`).click();
  await expect(page.getByTestId(`${prefix}-lane-tab-${lane}`)).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByTestId(chartTestId)).toHaveAttribute('data-lane', lane);
  await expect(page.getByTestId(`${axisPrefix}-time-caption`)).toHaveText(
    EXPECTED_CAPTIONS[lane],
  );
  await expect(page.getByTestId(`${axisPrefix}-y-axis`)).toHaveCount(1);
  await expect(page.getByTestId(`${axisPrefix}-x-axis`)).toHaveCount(1);
}

test.describe('compact ticker UTC temporal axes', () => {
  test('single-track ticker shows real events, carry-in holds, UTC details, and lane hierarchy', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountComparisonPanel(page, {
      single: true,
      viewport: { width: 800, height: 900 },
    });

    await assertLane(page, 'rating', 'rating-ticker-chart', 'compact-rating', 'day');
    await expect(page.getByTestId('rating-ticker-chart')).toHaveAttribute(
      'data-carry-in-only',
      'true',
    );
    await expect(page.getByTestId('rating-ticker-point')).toHaveCount(0);
    await expect(page.getByTestId('rating-ticker-series-path')).toHaveAttribute('d', / L /);
    await capture(page, 'single-day-800.png');

    await assertLane(page, 'rating', 'rating-ticker-chart', 'compact-rating', 'week');
    await capture(page, 'single-week-800.png');
    await assertLane(page, 'rating', 'rating-ticker-chart', 'compact-rating', 'month');
    await expect(page.locator('[data-time-boundary="iso-week"]')).toHaveCount(3);
    await capture(page, 'single-month-800.png');
    await assertLane(page, 'rating', 'rating-ticker-chart', 'compact-rating', 'year');
    await expect(page.getByTestId('compact-rating-x-tick-primary')).toHaveCount(11);
    await capture(page, 'single-year-800.png');

    await page.getByTestId('rating-lane-tab-overall').click();
    await expect(page.getByTestId('rating-ticker-chart')).toHaveAttribute('data-lane', 'overall');
    await expect(page.getByTestId('rating-ticker-point')).toHaveCount(1);
    await expect(page.getByTestId('rating-ticker-point-detail')).toContainText('UTC');
    await expect(page.getByTestId('rating-ticker-point-detail')).toContainText('win');
    const openGame = page.getByTestId('rating-point-finished-link');
    await expect(openGame).toHaveText('Open game');
    await expect(openGame).toHaveAttribute('href', '/finished/g-d-1');
    await capture(page, 'single-overall-800.png');
  });

  test('major comparison keeps real events and dominance while using the same hierarchy', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountComparisonPanel(page, { viewport: { width: 800, height: 900 } });
    await page.getByTestId('major-family-legend-daily').click();

    await assertLane(page, 'comparison', 'multi-line-rating-chart', 'compact-comparison', 'day');
    await expect(page.getByTestId('multi-line-point-free_day')).toHaveCount(0);
    await expect(page.getByTestId('multi-line-series-free_day')).toHaveAttribute('d', / L /);

    await assertLane(page, 'comparison', 'multi-line-rating-chart', 'compact-comparison', 'week');
    await assertLane(page, 'comparison', 'multi-line-rating-chart', 'compact-comparison', 'month');
    await expect(page.locator('[data-time-boundary="iso-week"]')).toHaveCount(3);
    await capture(page, 'comparison-month-800.png');
    await assertLane(page, 'comparison', 'multi-line-rating-chart', 'compact-comparison', 'year');
    await expect(page.getByTestId('compact-comparison-x-tick-primary')).toHaveCount(11);

    await page.getByTestId('comparison-lane-tab-overall').click();
    await expect(page.getByTestId('multi-line-rating-chart')).toHaveAttribute(
      'data-lane',
      'overall',
    );
    await expect(page.getByTestId('multi-line-point-free_day')).toHaveCount(1);
    await expect(page.getByTestId('multi-line-series-group-free_day')).toHaveAttribute(
      'data-dominant',
      'true',
    );
    await page.getByTestId('multi-line-point-free_day').hover();
    await expect(page.getByTestId('multi-line-hover-tooltip')).toContainText(
      'Aug 1, 2026, 12:00:00 PM UTC',
    );
    await page.getByTestId('multi-line-point-free_day').click();
    const openGame = page.getByTestId('multi-line-finished-link');
    await expect(openGame).toHaveText('Open game');
    await expect(openGame).toHaveAttribute('href', '/finished/g-d-1');
    await capture(page, 'comparison-overall-800.png');
  });
});
