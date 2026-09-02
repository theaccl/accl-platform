import { expect, test } from '@playwright/test';

import { COMPARISON_SELECT_EMPTY } from '../../components/profile/ratings/ratingTickerEmptyStates';
import { assertEssentialControlsUnclipped, assertNoScrollFittedLandscape, measureGalaxyFit, settleVisualViewport } from '../helpers/landscapeTickerGalaxyFit';
import { mountComparisonPanel } from '../helpers/mountComparisonPage';
import { mountLandscapeTicker } from '../helpers/mountLandscapeTickerPage';

const LANES = ['day', 'week', 'month', 'year', 'overall'] as const;

test.describe('landscape temporal axis and event-hold', () => {
  test('x-axis is visible in every lane and keeps both endpoints', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.clock.fastForward(50);

    for (const lane of LANES) {
      await page.getByTestId(`rating-lane-tab-${lane}`).click();
      await expect(page.getByTestId(`rating-lane-tab-${lane}`)).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(page.getByTestId('landscape-ticker-chart')).toHaveAttribute('data-lane', lane);
      await expect(page.getByTestId('landscape-ticker-x-axis')).toHaveCount(1);
      await expect(page.getByTestId('landscape-ticker-time-caption')).toBeVisible();
      await expect(page.locator('[data-tick-priority="endpoint"]')).toHaveCount(2);
      const caption = (await page.getByTestId('landscape-ticker-time-caption').textContent()) ?? '';
      expect(caption.length).toBeGreaterThan(0);
    }
  });

  test('UTC hierarchy and time ticks are presented at the top with a sectioned ELO scale', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.clock.fastForward(50);

    await page.getByTestId('rating-lane-tab-day').click();
    await expect(page.getByTestId('landscape-ticker-time-caption')).toHaveText(
      '2026 · Aug · ISO W34 · Fri 21 · UTC',
    );
    const dayTickY = await page.locator('[data-tick-priority="endpoint"]').first().getAttribute('y');
    expect(Number(dayTickY)).toBeLessThan(40);

    await expect(page.getByTestId('landscape-ticker-y-axis')).toHaveCount(1);
    await expect(page.getByTestId('landscape-ticker-scale-max')).toBeVisible();
    await expect(page.getByTestId('landscape-ticker-scale-min')).toBeVisible();
    await expect(page.getByTestId('landscape-ticker-scale-tick')).toHaveCount(3);

    await page.getByTestId('rating-lane-tab-week').click();
    await expect(page.getByTestId('landscape-ticker-time-caption')).toHaveText(
      '2026 · Aug · ISO W34 · UTC',
    );
    await page.getByTestId('rating-lane-tab-month').click();
    await expect(page.getByTestId('landscape-ticker-time-caption')).toHaveText(
      '2026 · Aug · ISO W31–W34 · UTC',
    );
    await expect(page.getByTestId('landscape-ticker-x-tick-primary')).toHaveCount(3);
    await expect(page.locator('[data-time-boundary="iso-week"]')).toHaveCount(3);
    await expect(page.locator('[data-tick-priority="secondary"]')).toHaveCount(0);
    await page.getByTestId('rating-lane-tab-year').click();
    await expect(page.getByTestId('landscape-ticker-time-caption')).toHaveText(
      '2026 · Jan–Dec · UTC',
    );
    await expect(page.getByTestId('landscape-ticker-x-tick-primary')).toHaveCount(11);
  });

  test('empty Day Week Month Year retain temporal scaffolding', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.clock.fastForward(50);
    await page.getByTestId('rating-lane-tab-day').click();
    await expect(page.getByTestId('landscape-ticker-x-axis')).toHaveCount(1);
    await expect(page.getByTestId('landscape-ticker-time-caption')).toBeVisible();
    await expect(page.locator('[data-tick-priority="endpoint"]')).toHaveCount(2);
    await expect(page.locator('[data-testid^="landscape-ticker-marker-free_blitz-"]')).toHaveCount(0);

    for (const lane of ['week', 'month', 'year'] as const) {
      await page.getByTestId(`rating-lane-tab-${lane}`).click();
      await expect(page.getByTestId('landscape-ticker-x-axis')).toHaveCount(1);
      await expect(page.locator('[data-tick-priority="endpoint"]')).toHaveCount(2);
    }
  });

  test('Overall with no history stays truthful and does not invent a path', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { empty: true, viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);
    await expect(page.getByTestId('landscape-ticker-time-caption')).toHaveText('No rating history.');
    await expect(page.locator('[data-testid^="landscape-ticker-path-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="landscape-ticker-marker-"]')).toHaveCount(0);
  });

  test('marker details keep UTC display time and raw ISO; holds are not focus targets', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.clock.fastForward(1800);
    await page.getByTestId('landscape-ticker-chart-focus').focus();
    await page.keyboard.press('Home');
    await expect(page.getByTestId('landscape-ticker-point-detail')).toBeVisible();
    await expect(page.getByTestId('landscape-ticker-point-iso')).toHaveText('2026-08-11T12:00:00Z');
    await expect(page.getByTestId('landscape-ticker-point-time')).not.toHaveText('');
    expect(await page.locator('[data-hold-span]').count()).toBe(0);
    const marker = page.locator('[data-testid^="landscape-ticker-marker-free_blitz-"]:not([data-testid*="halo"])').first();
    await expect(marker).toHaveAttribute('role', 'img');
    const markerTab = await marker.getAttribute('tabindex');
    expect(markerTab === '-1' || markerTab === null).toBe(true);
  });

  test('Galaxy essential controls stay visible without overlay scroll', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-24T18:00:00Z') });
    await mountLandscapeTicker(page, { viewport: { width: 883, height: 412 } });
    await settleVisualViewport(page);
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.clock.fastForward(50);
    await expect(page.getByTestId('landscape-ticker-x-axis')).toHaveCount(1);
    await assertEssentialControlsUnclipped(page);
    const fit = await measureGalaxyFit(page);
    expect(fit.landscapeFit).toBe('true');
    assertNoScrollFittedLandscape(fit);
  });

  test('hero still draws the step path', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await expect(page.getByTestId('landscape-ticker-path-free_blitz')).toHaveAttribute(
      'data-reveal-phase',
      'hero',
    );
    const d = await page.getByTestId('landscape-ticker-core-free_blitz').getAttribute('d');
    expect(d).toBeTruthy();
    expect(d).toContain(' L ');
    await expect(page.getByTestId('landscape-ticker-core-free_blitz')).toHaveAttribute('pathLength', '1');
  });

  test('compact empty-default remains intact', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-30T12:00:00Z') });
    await mountComparisonPanel(page, {
      crossing: true,
      viewport: { width: 360, height: 800 },
    });
    const panel = page.getByTestId('rating-family-comparison-panel');
    await expect(panel).toHaveAttribute('data-empty-open', 'true');
    await expect(page.getByTestId('comparison-all-hidden')).toHaveText(COMPARISON_SELECT_EMPTY);
    await expect(page.getByTestId('multi-line-rating-chart')).toHaveCount(0);
  });
});
