import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { mountComparisonPanel } from '../helpers/mountComparisonPage';

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date('2026-09-08T18:00:00Z') });
});

test('Profile opens compact Compare Mode without Expand and adds only requested CTs', async ({ page }) => {
  await mountComparisonPanel(page, {
    single: true,
    viewport: { width: 1100, height: 800 },
  });

  await expect(page.getByTestId('compact-compare-mode')).toBeVisible();
  await expect(page.getByTestId('compare-panel-main')).toBeVisible();
  await expect(page.locator('[data-testid^="compare-panel-ct"]')).toHaveCount(0);

  await page.getByTestId('compare-mode-toggle').click();
  await expect(page.getByTestId('compare-panel-ct1')).toBeVisible();
  await expect(page.locator('[data-testid^="compare-panel-ct"]')).toHaveCount(1);
  await expect(page.getByTestId('compare-panel-strip').locator('article').first()).toHaveAttribute('data-testid', 'compare-panel-main');

  await page.getByTestId('compare-add-ticker').click();
  await page.getByTestId('compare-add-ticker').click();
  await expect(page.locator('[data-testid^="compare-panel-ct"]')).toHaveCount(3);
  await expect(page.getByTestId('compare-add-ticker')).toBeDisabled();
});

test('Main lane controls CT unit and Overall disables Compare Mode honestly', async ({ page }) => {
  await mountComparisonPanel(page, { single: true, viewport: { width: 800, height: 700 } });
  await page.getByTestId('compare-mode-toggle').click();

  await page.getByTestId('rating-lane-tab-week').click();
  await expect(page.getByTestId('compare-panel-ct1').getByTestId('rating-ticker-chart')).toHaveAttribute('data-lane', 'week');
  await expect(page.getByTestId('compare-panel-ct1')).not.toContainText('Overall');

  await page.getByTestId('rating-lane-tab-overall').click();
  await expect(page.getByTestId('compare-mode-overall-explanation')).toBeVisible();
  await expect(page.getByTestId('compare-panel-main')).toBeVisible();
  await expect(page.locator('[data-testid^="compare-panel-ct"]')).toHaveCount(0);
});

test('CT date and real-game picker re-anchor the shared Main lane with real links', async ({ page }) => {
  await mountComparisonPanel(page, { single: true, viewport: { width: 430, height: 800 } });
  await page.getByTestId('compare-mode-toggle').click();

  const ct = page.getByTestId('compare-panel-ct1');
  await ct.getByText('Choose from games').click();
  const dailyGame = ct.locator('li').filter({ hasText: 'free_day' });
  await expect(dailyGame.getByRole('link', { name: 'Open game' })).toHaveAttribute('href', '/finished/g-d-1');
  await expect(dailyGame.getByRole('link', { name: 'Trainer review' })).toHaveAttribute('href', '/finished/g-d-1/train');
  await dailyGame.getByRole('button', { name: /2026-08-01 12:00 UTC/ }).click();
  await expect(ct.getByTestId('compare-summary-ct1')).toContainText('1 games · 1 rating events · +8');

  const date = ct.locator('input[type="date"]');
  await expect(date).toHaveAttribute('max', '2026-09-08');
});

test('phone CT strip uses one snap panel with accessible panel navigation', async ({ page }) => {
  await mountComparisonPanel(page, { single: true, viewport: { width: 390, height: 760 } });
  await page.getByTestId('compare-mode-toggle').click();
  await page.getByTestId('compare-add-ticker').click();

  const strip = page.getByTestId('compare-panel-strip');
  await expect(strip).toHaveCSS('overflow-x', 'auto');
  await expect(page.getByRole('button', { name: 'Previous panel' })).toBeDisabled();
  await page.getByRole('button', { name: 'Next panel' }).click();
  await expect(page.getByRole('button', { name: 'Previous panel' })).toBeEnabled();
});

test('Compare Mode setup and CT controls are keyboard reachable', async ({ page }) => {
  await mountComparisonPanel(page, { single: true, viewport: { width: 800, height: 700 } });
  const toggle = page.getByTestId('compare-mode-toggle');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('compare-panel-ct1')).toBeVisible();
  const date = page.getByTestId('compare-panel-ct1').locator('input[type="date"]');
  await date.focus();
  await expect(date).toBeFocused();
  await page.getByText('Choose from games').focus();
  await expect(page.getByText('Choose from games')).toBeFocused();
});

test('UTC-day reset happens on next reopen, never while the comparison is open', async ({ page }) => {
  await mountComparisonPanel(page, { single: true, viewport: { width: 800, height: 700 } });
  await page.getByTestId('compare-mode-toggle').click();
  await page.getByTestId('compare-add-ticker').click();
  await expect(page.locator('[data-testid^="compare-panel-ct"]')).toHaveCount(2);

  await page.clock.fastForward(8 * 60 * 60 * 1000);
  await expect(page.locator('[data-testid^="compare-panel-ct"]')).toHaveCount(2);

  await page.getByTestId('compare-mode-toggle').click();
  await page.getByTestId('compare-mode-toggle').click();
  await expect(page.locator('[data-testid^="compare-panel-ct"]')).toHaveCount(0);
  await expect(page.getByTestId('compare-add-ticker')).toContainText('(0/3)');
});

test('CTs retain independent anchors while sharing Main week, and removal frees its space', async ({ page }) => {
  await mountComparisonPanel(page, { single: true, viewport: { width: 1000, height: 760 } });
  await page.getByTestId('rating-lane-tab-week').click();
  await page.getByTestId('compare-mode-toggle').click();
  await page.getByTestId('compare-add-ticker').click();

  const ct1Date = page.getByTestId('compare-panel-ct1').locator('input[type="date"]');
  const ct2Date = page.getByTestId('compare-panel-ct2').locator('input[type="date"]');
  await ct1Date.fill('2026-08-01');
  await ct2Date.fill('2026-08-18');
  await expect(ct1Date).toHaveValue('2026-08-01');
  await expect(ct2Date).toHaveValue('2026-08-18');
  await expect(page.getByTestId('compare-panel-ct1').getByTestId('rating-ticker-chart')).toHaveAttribute('data-lane', 'week');
  await expect(page.getByTestId('compare-panel-ct2').getByTestId('rating-ticker-chart')).toHaveAttribute('data-lane', 'week');

  await page.getByRole('button', { name: 'Remove CT1' }).click();
  await expect(page.getByTestId('compare-panel-ct1')).toHaveCount(0);
  await expect(page.getByTestId('compare-panel-ct2')).toContainText('rank 2');
});

test('complete carry-in, true empty, and incomplete coverage stay distinguishable', async ({ page }) => {
  await mountComparisonPanel(page, { single: true, viewport: { width: 800, height: 700 } });
  await page.getByTestId('compare-mode-toggle').click();
  await expect(page.getByTestId('compare-summary-ct1')).toHaveText('0 games · 0 rating events');
  await expect(page.getByTestId('compare-panel-ct1').getByTestId('rating-ticker-chart')).toHaveAttribute('data-carry-in-only', 'true');

  await mountComparisonPanel(page, { single: true, empty: true, viewport: { width: 800, height: 700 } });
  await page.getByTestId('compare-mode-toggle').click();
  await expect(page.getByTestId('compare-summary-ct1')).toHaveText('0 games · 0 rating events');
  await expect(page.getByTestId('compare-panel-ct1').getByTestId('rating-ticker-chart-empty')).toBeVisible();

  await mountComparisonPanel(page, {
    single: true,
    compareCoverage: 'incomplete',
    viewport: { width: 800, height: 700 },
  });
  await page.getByTestId('compare-mode-toggle').click();
  await expect(page.getByTestId('compare-summary-ct1')).toHaveText('Coverage incomplete — totals withheld');
  await expect(page.getByText('Fixture coverage is incomplete.')).toBeVisible();
});

test('comparison adjustments retain ratings and UTC time without claiming a drawn game', async ({ page }) => {
  await mountComparisonPanel(page, {
    single: true,
    compareAdjustment: true,
    viewport: { width: 1000, height: 760 },
  });
  await page.getByTestId('rating-lane-tab-month').click();
  await page.getByTestId('compare-mode-toggle').click();
  const ct = page.getByTestId('compare-panel-ct1');
  await ct.getByRole('button', { name: 'Previous period', exact: true }).click();
  await expect(ct.getByTestId('compare-summary-ct1')).toHaveText('0 games · 1 rating events · +12');
  await expect(ct).toContainText('1510 → 1522');
  await expect(ct).toContainText('Aug 29, 2026, 8:00:00 PM UTC · Rating adjustment');
  await expect(ct).not.toContainText('draw');
  await expect(ct.getByRole('link', { name: 'Open game', exact: true })).toHaveCount(0);
  await expect(ct.getByRole('link', { name: 'Trainer review', exact: true })).toHaveCount(0);
  if (process.env.R042_CAPTURE_DIR) {
    mkdirSync(process.env.R042_CAPTURE_DIR, { recursive: true });
    await ct.screenshot({ path: join(process.env.R042_CAPTURE_DIR, 'comparison-adjustment.png') });
  }
  // Main's existing game result rendering is unaffected by the CT-specific formatter.
  await page.getByTestId('rating-lane-tab-overall').click();
  await expect(page.getByTestId('compare-panel-main')).toContainText('win');
  await expect(page.getByTestId('compare-panel-main')).not.toContainText('Rating adjustment');
});

test('Previous panel moves immediately after removing the last visible comparison', async ({ page }) => {
  await mountComparisonPanel(page, { single: true, viewport: { width: 390, height: 844 } });
  await page.getByTestId('compare-mode-toggle').click();
  await page.getByTestId('compare-add-ticker').click();
  await page.getByTestId('compare-add-ticker').click();
  const next = page.getByRole('button', { name: 'Next panel', exact: true });
  await next.click();
  await next.click();
  await next.click();
  await page.getByRole('button', { name: 'Remove CT3', exact: true }).click();
  const strip = page.getByTestId('compare-panel-strip');
  const before = await strip.evaluate((el) => el.scrollLeft);
  await page.getByRole('button', { name: 'Previous panel', exact: true }).click();
  await expect.poll(() => strip.evaluate((el) => el.scrollLeft)).toBeLessThan(before - 100);
  await expect(page.getByTestId('compare-panel-ct1')).toBeInViewport({ ratio: 0.5 });
});

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 1000 }]) {
  test(`Main owns working major-family controls at ${viewport.width}px`, async ({ page }) => {
    await mountComparisonPanel(page, { single: true, accl: true, viewport });
    const main = page.getByTestId('compare-panel-main');
    const options = main.getByTestId('accl-ticker-major-family-options');
    await expect(options.getByRole('button')).toHaveCount(5);
    await page.getByTestId('compare-mode-toggle').click();
    const ct = page.getByTestId('compare-panel-ct1');
    for (const track of ['tournament', 'free_bullet', 'free_blitz', 'free_rapid', 'free_day']) {
      const button = main.getByTestId(`accl-ticker-option-${track}`);
      await button.press('Enter');
      await expect(button).toHaveAttribute('aria-pressed', 'true');
      await expect(main.getByTestId(`multi-line-series-${track}`)).toHaveCount(1);
    }
    await expect(ct.getByTestId('accl-ticker-major-family-options')).toHaveCount(0);
    await expect(main.getByTestId('multi-line-rating-chart')).toHaveAttribute('data-dominance-order', 'accl tournament free_bullet free_blitz free_rapid free_day');
    await main.getByTestId('accl-ticker-option-free_blitz').press('Enter');
    await expect(main.getByTestId('multi-line-series-free_blitz')).toHaveCount(0);
    await expect(main.getByTestId('multi-line-series-free_day')).toHaveCount(1);
    await page.getByTestId('rating-lane-tab-year').click();
    await expect(main.getByTestId('accl-ticker-option-free_day')).toHaveAttribute('aria-pressed', 'true');
    await expect(ct.getByTestId('rating-ticker-chart')).toHaveAttribute('data-lane', 'year');
    const contained = await options.evaluate((el) => {
      const panel = el.closest('article')!.getBoundingClientRect();
      return [...el.querySelectorAll('button')].every((button) => {
        const box = button.getBoundingClientRect();
        return box.left >= panel.left - 1 && box.right <= panel.right + 1;
      });
    });
    expect(contained).toBe(true);
    if (process.env.R042_CAPTURE_DIR) {
      mkdirSync(process.env.R042_CAPTURE_DIR, { recursive: true });
      await main.screenshot({ path: join(process.env.R042_CAPTURE_DIR, `main-family-controls-${viewport.width}.png`) });
    }
  });
}
