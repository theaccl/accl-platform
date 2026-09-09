import { expect, test, type Page } from '@playwright/test';

import { COMPARISON_SELECT_EMPTY } from '../../components/profile/ratings/ratingTickerEmptyStates';
import { mountComparisonPanel } from '../helpers/mountComparisonPage';

const LEGEND_IDS = [
  'major-family-legend-tournament',
  'major-family-legend-bullet',
  'major-family-legend-blitz',
  'major-family-legend-rapid',
  'major-family-legend-daily',
] as const;

async function mountCompactCrossing(page: Page): Promise<void> {
  await page.clock.install({ time: new Date('2026-08-30T12:00:00Z') });
  await mountComparisonPanel(page, {
    crossing: true,
    viewport: { width: 360, height: 800 },
  });
  await page.getByTestId('comparison-lane-tab-overall').click();
}

async function assertFreshEmptyCompact(page: Page): Promise<void> {
  const panel = page.getByTestId('rating-family-comparison-panel');
  await expect(panel).toHaveAttribute('data-empty-open', 'true');
  await expect(panel).toHaveAttribute('data-dominance-order', 'none');
  await expect(panel).toHaveAttribute('data-dominant-category', 'none');
  await expect(page.getByTestId('multi-line-rating-chart')).toHaveCount(0);
  await expect(page.locator('[data-testid^="multi-line-series-"]')).toHaveCount(0);
  await expect(page.locator('[data-testid^="multi-line-point-"]')).toHaveCount(0);
  await expect(page.getByTestId('comparison-all-hidden')).toHaveText(COMPARISON_SELECT_EMPTY);
  for (const id of LEGEND_IDS) {
    await expect(page.getByTestId(id)).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId(id)).toBeVisible();
  }
  const legendOrder = await page
    .getByTestId('major-family-legend')
    .locator('button')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-testid')));
  expect(legendOrder).toEqual([...LEGEND_IDS]);
}

test.describe('compact comparison empty default', () => {
  test('fresh mount has no selection, geometry, or dominant series', async ({ page }) => {
    await mountCompactCrossing(page);
    await assertFreshEmptyCompact(page);
  });

  test('Rapid then Blitz then Daily become successive painted dominants', async ({ page }) => {
    await mountCompactCrossing(page);
    const panel = page.getByTestId('rating-family-comparison-panel');

    await page.getByTestId('major-family-legend-rapid').click();
    await expect(page.getByTestId('major-family-legend-rapid')).toHaveAttribute('aria-pressed', 'true');
    await expect(panel).toHaveAttribute('data-dominance-order', 'free_rapid');
    await expect(panel).toHaveAttribute('data-dominant-category', 'free_rapid');
    await expect(page.getByTestId('multi-line-series-group-free_rapid')).toHaveAttribute(
      'data-dominant',
      'true',
    );
    await expect(page.locator('[data-testid^="multi-line-series-group-"]')).toHaveCount(1);

    await page.getByTestId('major-family-legend-blitz').click();
    await expect(panel).toHaveAttribute('data-dominance-order', 'free_rapid free_blitz');
    await expect(panel).toHaveAttribute('data-dominant-category', 'free_blitz');
    await expect(page.getByTestId('multi-line-series-group-free_blitz')).toHaveAttribute(
      'data-dominant',
      'true',
    );
    await expect(page.getByTestId('multi-line-series-group-free_rapid')).toHaveAttribute(
      'data-dominant',
      'false',
    );

    await page.getByTestId('major-family-legend-daily').click();
    await expect(panel).toHaveAttribute('data-dominance-order', 'free_rapid free_blitz free_day');
    await expect(panel).toHaveAttribute('data-dominant-category', 'free_day');
    await expect(page.getByTestId('multi-line-series-group-free_day')).toHaveAttribute(
      'data-dominant',
      'true',
    );
  });

  test('deselect/reselect Rapid makes Rapid dominant and lane change keeps the session', async ({
    page,
  }) => {
    await mountCompactCrossing(page);
    const panel = page.getByTestId('rating-family-comparison-panel');
    await page.getByTestId('major-family-legend-rapid').click();
    await page.getByTestId('major-family-legend-blitz').click();
    await page.getByTestId('major-family-legend-daily').click();

    await page.getByTestId('major-family-legend-rapid').click();
    await expect(page.getByTestId('major-family-legend-rapid')).toHaveAttribute('aria-pressed', 'false');
    await expect(panel).toHaveAttribute('data-dominance-order', 'free_blitz free_day');
    await expect(panel).toHaveAttribute('data-dominant-category', 'free_day');

    await page.getByTestId('major-family-legend-rapid').click();
    await expect(page.getByTestId('major-family-legend-rapid')).toHaveAttribute('aria-pressed', 'true');
    await expect(panel).toHaveAttribute('data-dominance-order', 'free_blitz free_day free_rapid');
    await expect(panel).toHaveAttribute('data-dominant-category', 'free_rapid');
    await expect(page.getByTestId('multi-line-series-group-free_rapid')).toHaveAttribute(
      'data-dominant',
      'true',
    );

    await page.getByTestId('comparison-lane-tab-year').click();
    await expect(panel).toHaveAttribute('data-dominance-order', 'free_blitz free_day free_rapid');
    await expect(panel).toHaveAttribute('data-dominant-category', 'free_rapid');
    await expect(page.getByTestId('major-family-legend-rapid')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('major-family-legend-blitz')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('major-family-legend-daily')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('comparison-lane-tab-overall').click();
    await expect(panel).toHaveAttribute('data-dominance-order', 'free_blitz free_day free_rapid');
    await expect(panel).toHaveAttribute('data-dominant-category', 'free_rapid');
  });

  test('zero-point selection stays pressed without becoming painted dominant', async ({ page }) => {
    await mountCompactCrossing(page);
    const panel = page.getByTestId('rating-family-comparison-panel');

    await page.getByTestId('major-family-legend-rapid').click();
    await page.getByTestId('major-family-legend-tournament').click();
    await expect(page.getByTestId('major-family-legend-tournament')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('major-family-legend-tournament')).toHaveAttribute(
      'data-point-count',
      '0',
    );
    await expect(panel).toHaveAttribute('data-dominance-order', 'free_rapid tournament');
    await expect(panel).toHaveAttribute('data-dominant-category', 'free_rapid');
    await expect(page.getByTestId('multi-line-series-group-tournament')).toHaveCount(0);
    await expect(page.getByTestId('multi-line-series-group-free_rapid')).toHaveAttribute(
      'data-dominant',
      'true',
    );
    await expect(page.locator('[data-testid="multi-line-point-tournament"]')).toHaveCount(0);
  });

  test('fresh remount resets to empty while expanded compare stays independently empty', async ({
    page,
  }) => {
    await mountCompactCrossing(page);
    const panel = page.getByTestId('rating-family-comparison-panel');
    await page.getByTestId('major-family-legend-rapid').click();
    await expect(panel).toHaveAttribute('data-dominant-category', 'free_rapid');

    await page.getByTestId('rating-comparison-expand-mobile').click();
    await expect(page.getByTestId('expanded-rating-ticker-drawer')).toBeVisible();
    await expect(page.getByTestId('expanded-rating-ticker-drawer')).toHaveAttribute(
      'data-dominance-order',
      'none',
    );
    await expect(page.getByTestId('landscape-ticker-chart')).toHaveAttribute('data-empty-open', 'true');
    await expect(page.getByTestId('landscape-ticker-category-rapid')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(panel).toHaveAttribute('data-dominant-category', 'free_rapid');

    await page.getByTestId('expanded-ticker-close').click();
    await mountComparisonPanel(page, {
      crossing: true,
      viewport: { width: 360, height: 800 },
    });
    await page.getByTestId('comparison-lane-tab-overall').click();
    await assertFreshEmptyCompact(page);
  });
});
