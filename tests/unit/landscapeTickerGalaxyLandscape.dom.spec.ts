import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { collectDialogFocusOrder } from '../helpers/landscapeTickerEvidence';
import {
  assertEssentialControlsUnclipped,
  assertExpandDisplay,
  assertLandscapeFitFollowsMeasurement,
  assertNoScrollFittedLandscape,
  assertOverlayMatchesVisualViewport,
  assertTabCycleStaysInDialog,
  EXPAND_HIDDEN_VIEWPORTS,
  EXPAND_VISIBLE_VIEWPORTS,
  FITTED_LANDSCAPE_VIEWPORTS,
  measureGalaxyFit,
  settleVisualViewport,
} from '../helpers/landscapeTickerGalaxyFit';
import { mountComparisonPanel } from '../helpers/mountComparisonPage';
import { mountLandscapeTicker } from '../helpers/mountLandscapeTickerPage';

test.describe('galaxy landscape expand reachability', () => {
  for (const viewport of EXPAND_VISIBLE_VIEWPORTS) {
    test(`both Expand controls are visible at ${viewport.label}`, async ({ page }) => {
      await mountLandscapeTicker(page, { open: false, viewport });
      await assertExpandDisplay(page, 'rating-ticker-expand-mobile', true);

      await mountComparisonPanel(page, { crossing: true, viewport });
      await assertExpandDisplay(page, 'rating-comparison-expand-mobile', true);
    });
  }

  for (const viewport of EXPAND_HIDDEN_VIEWPORTS) {
    test(`both Expand controls are hidden at ${viewport.label}`, async ({ page }) => {
      await mountLandscapeTicker(page, { open: false, viewport });
      await assertExpandDisplay(page, 'rating-ticker-expand-mobile', false);

      await mountComparisonPanel(page, { crossing: true, viewport });
      await assertExpandDisplay(page, 'rating-comparison-expand-mobile', false);
    });
  }

  test('harness Expand uses the production expandMobile class, not sm:hidden', () => {
    const harness = readFileSync(
      join(process.cwd(), 'tests/helpers/landscapeTickerHarnessEntry.tsx'),
      'utf8',
    );
    const css = readFileSync(
      join(process.cwd(), 'components/profile/ratings/landscapeRatingTicker.module.css'),
      'utf8',
    );
    expect(harness).toContain('styles.expandMobile');
    expect(harness).not.toContain('sm:hidden');
    expect(css).toContain('.expandMobile');
    expect(css).toContain('@media (min-width: 1024px) and (min-height: 600px)');
    expect(existsSync(join(process.cwd(), 'lib/profile/landscapeTickerSwipe.ts'))).toBe(false);
  });
});

test.describe('galaxy landscape rotation refit', () => {
  test('open portrait, rotate landscape, rotate portrait keeps overlay, fit, and dominance', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-08-24T18:00:00Z') });
    await mountLandscapeTicker(page, { open: false, viewport: { width: 360, height: 800 } });
    await page.getByTestId('rating-ticker-expand-mobile').click();
    await page.getByTestId('expanded-rating-ticker-drawer').waitFor();
    await settleVisualViewport(page);

    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.getByTestId('landscape-ticker-category-rapid').click();
    await page.clock.fastForward(1800);
    await page.clock.fastForward(1800);

    const drawer = page.getByTestId('expanded-rating-ticker-drawer');
    await expect(drawer).toHaveAttribute('data-dominance-order', 'free_blitz free_rapid');
    const portrait = await measureGalaxyFit(page);
    expect(portrait.landscapeFit).toBe('false');
    assertLandscapeFitFollowsMeasurement(portrait);

    await page.setViewportSize({ width: 800, height: 360 });
    await settleVisualViewport(page);
    const landscape = await measureGalaxyFit(page);
    expect(landscape.simulatedReducedViewport).toBe(true);
    expect(landscape.physicalSamsungBrowser).toBe(false);
    assertOverlayMatchesVisualViewport(landscape);
    assertLandscapeFitFollowsMeasurement(landscape);
    expect(landscape.landscapeFit).toBe('true');
    await expect(drawer).toHaveAttribute('data-dominance-order', 'free_blitz free_rapid');
    await assertEssentialControlsUnclipped(page);
    assertNoScrollFittedLandscape(landscape);
    await assertTabCycleStaysInDialog(page);

    await page.setViewportSize({ width: 360, height: 800 });
    await settleVisualViewport(page);
    const back = await measureGalaxyFit(page);
    assertOverlayMatchesVisualViewport(back);
    assertLandscapeFitFollowsMeasurement(back);
    expect(back.landscapeFit).toBe('false');
    await expect(drawer).toHaveAttribute('data-dominance-order', 'free_blitz free_rapid');
  });

  test('Expand at 800x360 does not resize to portrait first', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-24T18:00:00Z') });
    await mountLandscapeTicker(page, { open: false, viewport: { width: 800, height: 360 } });
    await assertExpandDisplay(page, 'rating-ticker-expand-mobile', true);
    await page.getByTestId('rating-ticker-expand-mobile').click();
    await settleVisualViewport(page);
    const size = page.viewportSize();
    expect(size).toEqual({ width: 800, height: 360 });
    const m = await measureGalaxyFit(page);
    assertOverlayMatchesVisualViewport(m);
    expect(m.landscapeFit).toBe('true');
  });
});

test.describe('galaxy landscape reduced-height no-scroll', () => {
  for (const viewport of FITTED_LANDSCAPE_VIEWPORTS) {
    test(`fitted no-scroll at simulated ${viewport.label}`, async ({ page }) => {
      await page.clock.install({ time: new Date('2026-08-24T18:00:00Z') });
      await mountLandscapeTicker(page, { viewport });
      await settleVisualViewport(page);
      const m = await measureGalaxyFit(page);
      expect(m.innerWidth).toBe(viewport.width);
      expect(m.innerHeight).toBe(viewport.height);
      expect(m.visualViewport.width).toBe(viewport.width);
      expect(m.visualViewport.height).toBe(viewport.height);
      assertOverlayMatchesVisualViewport(m);
      assertLandscapeFitFollowsMeasurement(m);
      expect(m.landscapeFit).toBe('true');
      assertNoScrollFittedLandscape(m);
      await assertEssentialControlsUnclipped(page);
      const focus = await collectDialogFocusOrder(page);
      expect(focus.hiddenFocusable).toEqual([]);
      await expect(page.getByTestId('rating-ticker-point-list')).toBeAttached();
      await expect(page.getByTestId('rating-ticker-point-list')).not.toBeVisible();
    });
  }
});

test.describe('galaxy landscape focus restoration', () => {
  test('close in landscape restores focus to a visible ticker Expand', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-24T18:00:00Z') });
    await mountLandscapeTicker(page, { open: false, viewport: { width: 800, height: 360 } });
    const expand = page.getByTestId('rating-ticker-expand-mobile');
    await expand.click();
    await settleVisualViewport(page);
    await page.getByTestId('expanded-ticker-close').click();
    await expect(page.getByTestId('expanded-rating-ticker-drawer')).toHaveCount(0);
    await expect(expand).toBeVisible();
    await expect(expand).toBeFocused();
    const tag = await page.evaluate(() => document.activeElement?.tagName ?? '');
    expect(tag).not.toBe('BODY');
  });

  test('close in landscape restores focus to a visible comparison Expand', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-24T18:00:00Z') });
    await mountComparisonPanel(page, { crossing: true, viewport: { width: 800, height: 360 } });
    const expand = page.getByTestId('rating-comparison-expand-mobile');
    await expect(expand).toBeVisible();
    await expand.click();
    await page.getByTestId('expanded-rating-ticker-drawer').waitFor();
    await settleVisualViewport(page);
    await page.getByTestId('expanded-ticker-close').click();
    await expect(page.getByTestId('expanded-rating-ticker-drawer')).toHaveCount(0);
    await expect(expand).toBeVisible();
    await expect(expand).toBeFocused();
    const tag = await page.evaluate(() => document.activeElement?.tagName ?? '');
    expect(tag).not.toBe('BODY');
  });
});
