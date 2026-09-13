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
  await expect(dailyGame.getByRole('button')).toHaveAccessibleName(
    /Use 2026-08-01 12:00 UTC · free_day · win · 1500 → 1508 \(\+8\) for CT1/,
  );
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
  await ct.getByRole('button', { name: 'Previous period for CT1', exact: true }).click();
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

test('CTs withhold stale results while a new period or track is loading', async ({ page }) => {
  await mountComparisonPanel(page, {
    single: true,
    switchableTrack: true,
    compareLoadDelayMs: 1_000,
    viewport: { width: 1000, height: 760 },
  });
  await page.getByTestId('rating-lane-tab-month').click();
  await page.getByTestId('compare-mode-toggle').click();
  const ct = page.getByTestId('compare-panel-ct1');

  await expect(ct.getByText('Loading verified history…')).toBeVisible();
  await expect(ct.getByTestId('rating-ticker-chart')).toHaveCount(0);
  await page.clock.fastForward(1_000);
  await expect(ct.getByTestId('rating-ticker-chart')).toBeVisible();

  await ct.getByRole('button', { name: 'Previous period for CT1', exact: true }).click();
  await expect(ct.getByText('Loading verified history…')).toBeVisible();
  await expect(ct.getByTestId('rating-ticker-chart')).toHaveCount(0);
  await page.clock.fastForward(1_000);
  await expect(ct.getByTestId('rating-ticker-chart')).toBeVisible();

  await page.getByTestId('switch-rating-track').click();
  await expect(ct.getByText('Loading verified history…')).toBeVisible();
  await expect(ct.getByTestId('rating-ticker-chart')).toHaveCount(0);
  await page.clock.fastForward(1_000);
  await expect(ct.getByTestId('rating-ticker-chart')).toBeVisible();
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

test('mobile period controls belong to Main and never render inside comparison panels', async ({ page }) => {
  await mountComparisonPanel(page, { single: true, viewport: { width: 390, height: 844 } });
  await page.getByTestId('compare-mode-toggle').click();
  await page.getByTestId('compare-add-ticker').click();

  const main = page.getByTestId('compare-panel-main');
  await expect(main.getByTestId('rating-lane-tabs')).toHaveCount(1);
  for (const lane of ['day', 'week', 'month', 'year', 'overall']) {
    await expect(main.getByTestId(`rating-lane-tab-${lane}`)).toHaveCount(1);
  }

  for (const slot of ['ct1', 'ct2']) {
    await expect(page.getByTestId(`compare-panel-${slot}`).getByTestId('rating-lane-tabs')).toHaveCount(0);
  }
});

test('Expand opens Independent with Main first and every retained CT on its own scale', async ({ page }) => {
  await mountComparisonPanel(page, { single: true, accl: true, viewport: { width: 1200, height: 900 } });
  await page.getByTestId('rating-lane-tab-week').click();
  await page.getByTestId('compare-mode-toggle').click();
  await page.getByTestId('compare-add-ticker').click();
  await page.getByTestId('compare-add-ticker').click();
  await page.getByTestId('compare-panel-ct1').locator('input[type="date"]').fill('2026-08-12');
  await page.getByTestId('compare-panel-ct2').locator('input[type="date"]').fill('2026-08-13');
  await page.getByTestId('compare-panel-ct3').locator('input[type="date"]').fill('2026-08-14');

  await page.getByTestId('rating-ticker-expand-mobile').click();
  const drawer = page.getByTestId('expanded-independent-compare-drawer');
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute('data-compare-layout', 'independent');
  await expect(drawer).toHaveAttribute('data-panel-count', '4');
  await expect(drawer.getByRole('tab', { name: 'Independent' })).toHaveAttribute('aria-selected', 'true');
  await expect(drawer.getByRole('tab', { name: /Merge/ })).toBeDisabled();

  const grid = drawer.getByTestId('expanded-independent-panel-grid');
  await expect(grid.locator(':scope > article')).toHaveCount(4);
  await expect(grid.locator(':scope > article').first()).toHaveAttribute('data-testid', 'expanded-compare-panel-main');
  await expect(drawer.getByTestId('expanded-compare-panel-ct1').locator('input[type="date"]')).toHaveValue('2026-08-12');
  await expect(drawer.getByTestId('expanded-compare-panel-ct2').locator('input[type="date"]')).toHaveValue('2026-08-13');
  await expect(drawer.getByTestId('expanded-compare-panel-ct3').locator('input[type="date"]')).toHaveValue('2026-08-14');
  await expect(drawer.locator('[data-testid^="expanded-compare-panel-ct"]')).toHaveCount(3);
  await expect(drawer.getByTestId('rating-lane-tabs')).toHaveCount(1);
  for (const slot of ['ct1', 'ct2', 'ct3']) {
    const slotName = slot.toUpperCase();
    const panel = drawer.getByTestId(`expanded-compare-panel-${slot}`);
    await expect(panel.getByTestId('rating-ticker-chart')).toHaveAttribute('data-lane', 'week');
    await expect(panel).toHaveAccessibleName(new RegExp(`^${slotName} · rank`));
    await expect(panel.getByRole('button', { name: `Previous period for ${slotName}` })).toBeVisible();
    await expect(panel.getByRole('textbox', { name: `UTC date for ${slotName}` })).toBeVisible();
    await expect(panel.getByRole('button', { name: `Next period for ${slotName}` })).toBeVisible();
    await expect(panel.locator(`summary[aria-label="Choose from games for ${slotName}"]`)).toBeVisible();
  }
  if (process.env.R042_STACK3_CAPTURE_DIR) {
    mkdirSync(process.env.R042_STACK3_CAPTURE_DIR, { recursive: true });
    await drawer.screenshot({ path: join(process.env.R042_STACK3_CAPTURE_DIR, 'expanded-independent-1200.png') });
  }
});

test('Expanded CT controls retain anchors, real links, and state after close', async ({ page }) => {
  await mountComparisonPanel(page, { single: true, accl: true, viewport: { width: 1000, height: 800 } });
  await page.getByTestId('rating-lane-tab-month').click();
  await page.getByTestId('compare-mode-toggle').click();
  await page.getByTestId('rating-ticker-expand-mobile').click();

  const drawer = page.getByTestId('expanded-independent-compare-drawer');
  const ct1 = drawer.getByTestId('expanded-compare-panel-ct1');
  await ct1.getByText('Choose from games').click();
  const dailyGame = ct1.locator('li').filter({ hasText: 'free_day' });
  await expect(dailyGame.getByRole('link', { name: 'Open game' })).toHaveAttribute('href', '/finished/g-d-1');
  await expect(dailyGame.getByRole('link', { name: 'Trainer review' })).toHaveAttribute('href', '/finished/g-d-1/train');
  await dailyGame.getByRole('button', { name: /2026-08-01 12:00 UTC/ }).click();
  await expect(ct1.locator('input[type="date"]')).toHaveValue('2026-08-01');
  await expect(ct1.getByTestId('compare-summary-ct1')).toContainText('1 games · 1 rating events');

  await drawer.getByTestId('expanded-independent-close').click();
  await expect(drawer).toHaveCount(0);
  await expect(page.getByTestId('compare-panel-ct1').locator('input[type="date"]')).toHaveValue('2026-08-01');
});

test('Expanded Independent keeps Main as the only lane selector and hides CTs on Overall', async ({ page }) => {
  await mountComparisonPanel(page, { single: true, accl: true, viewport: { width: 1000, height: 800 } });
  await page.getByTestId('compare-mode-toggle').click();
  await page.getByTestId('compare-add-ticker').click();
  await page.getByTestId('rating-ticker-expand-mobile').click();

  const drawer = page.getByTestId('expanded-independent-compare-drawer');
  await expect(drawer.getByRole('tablist', { name: 'Expanded rating history window' })).toHaveCount(1);
  await expect(drawer.locator('[data-testid^="expanded-compare-panel-ct"] [role="tablist"]')).toHaveCount(0);
  await drawer.getByTestId('rating-lane-tab-overall').click();
  await expect(drawer.locator('[data-testid^="expanded-compare-panel-ct"]')).toHaveCount(0);
  await expect(drawer.getByTestId('expanded-compare-overall-explanation')).toBeVisible();
  await drawer.getByTestId('rating-lane-tab-month').click();
  await expect(drawer.locator('[data-testid^="expanded-compare-panel-ct"]')).toHaveCount(2);
});

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`Expanded Independent fits and scrolls safely at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await mountComparisonPanel(page, { single: true, accl: true, viewport });
    await page.getByTestId('compare-mode-toggle').click();
    await page.getByTestId('compare-add-ticker').click();
    await page.getByTestId('compare-add-ticker').click();
    const expand = page.getByTestId('rating-ticker-expand-mobile');
    await expand.click();

    const drawer = page.getByTestId('expanded-independent-compare-drawer');
    const body = drawer.getByTestId('expanded-independent-body-scroll');
    await expect(drawer).toHaveAttribute('data-panel-count', '4');
    await expect(body).toHaveCSS('overflow-y', 'auto');
    const fit = await drawer.evaluate((element) => {
      const panels = [...element.querySelectorAll<HTMLElement>('[data-testid^="expanded-compare-panel-"]')];
      return {
        pageFits: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        panelsFit: panels.every((panel) => panel.getBoundingClientRect().right <= element.getBoundingClientRect().right + 1),
      };
    });
    expect(fit).toEqual({ pageFits: true, panelsFit: true });
    if (process.env.R042_STACK3_CAPTURE_DIR) {
      mkdirSync(process.env.R042_STACK3_CAPTURE_DIR, { recursive: true });
      await drawer.screenshot({ path: join(process.env.R042_STACK3_CAPTURE_DIR, `expanded-independent-${viewport.width}x${viewport.height}.png`) });
    }

    await drawer.press('Tab');
    await expect(drawer.getByRole('tab', { name: 'Independent' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(expand).toBeFocused();
  });
}

test('Expand without active CTs preserves the existing R040 landscape drawer', async ({ page }) => {
  await mountComparisonPanel(page, { single: true, accl: true, viewport: { width: 1000, height: 800 } });
  await page.getByTestId('rating-ticker-expand-mobile').click();
  await expect(page.getByTestId('expanded-rating-ticker-drawer')).toBeVisible();
  await expect(page.getByTestId('expanded-independent-compare-drawer')).toHaveCount(0);
});

test('an open comparison with every CT removed still expands as Independent Main', async ({ page }) => {
  await mountComparisonPanel(page, { single: true, accl: true, viewport: { width: 1000, height: 800 } });
  await page.getByTestId('compare-mode-toggle').click();
  await page.getByRole('button', { name: 'Remove CT1' }).click();
  await page.getByTestId('rating-ticker-expand-mobile').click();
  const drawer = page.getByTestId('expanded-independent-compare-drawer');
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute('data-panel-count', '1');
  await expect(drawer.getByTestId('expanded-compare-panel-main')).toBeVisible();
});

test('expanding an already-open comparison across UTC midnight preserves it until a later reopen', async ({ page }) => {
  await mountComparisonPanel(page, { single: true, accl: true, viewport: { width: 1000, height: 800 } });
  await page.getByTestId('rating-lane-tab-day').click();
  await page.getByTestId('compare-mode-toggle').click();
  await page.getByTestId('compare-add-ticker').click();
  await page.clock.fastForward(8 * 60 * 60 * 1000);

  await page.getByTestId('rating-ticker-expand-mobile').click();
  const independent = page.getByTestId('expanded-independent-compare-drawer');
  await expect(independent).toHaveAttribute('data-panel-count', '3');
  await expect(
    independent.getByTestId('expanded-compare-panel-main').getByTestId('rating-ticker-chart'),
  ).toHaveAttribute('data-time-caption', /Wed 9 · UTC$/);
  await independent.getByTestId('expanded-independent-close').click();

  await page.getByTestId('compare-mode-toggle').click();
  await page.getByTestId('rating-ticker-expand-mobile').click();
  await expect(page.getByTestId('expanded-rating-ticker-drawer')).toBeVisible();
  await expect(page.getByTestId('expanded-independent-compare-drawer')).toHaveCount(0);
});

test('a pending replacement period never renders the prior period history under its caption', async ({ page }) => {
  await mountComparisonPanel(page, {
    single: true,
    compareLoadDelayMs: 1_000,
    viewport: { width: 900, height: 760 },
  });
  await page.getByTestId('compare-mode-toggle').click();
  await page.clock.fastForward(1_000);

  const ct = page.getByTestId('compare-panel-ct1');
  await expect(ct.getByTestId('rating-ticker-chart')).toBeVisible();
  await ct.getByRole('button', { name: 'Previous period for CT1' }).click();
  await expect(ct.getByText('Loading verified history…')).toBeVisible();
  await expect(ct.getByTestId('rating-ticker-chart')).toHaveCount(0);

  await page.clock.fastForward(1_000);
  await expect(ct.getByTestId('rating-ticker-chart')).toBeVisible();
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
