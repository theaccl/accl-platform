import { expect, test } from '@playwright/test';

import { mountLandscapeTicker } from '../helpers/mountLandscapeTickerPage';

test.describe('landscape ticker zero-point painted dominance', () => {
  test('zero-point selection stays pressed without becoming painted dominant', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { crossing: true, viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);

    const chart = page.getByTestId('landscape-ticker-chart');
    const drawer = page.getByTestId('expanded-rating-ticker-drawer');
    const rapid = page.getByTestId('landscape-ticker-path-free_rapid');
    const acclControl = page.getByTestId('landscape-ticker-category-accl');

    await page.getByTestId('landscape-ticker-category-rapid').click();
    await page.clock.fastForward(1800);

    await expect(chart).toHaveAttribute('data-dominant-category', 'free_rapid');
    await expect(chart).toHaveAttribute('data-dominance-order', 'free_rapid');
    await expect(chart).toHaveAttribute('data-painted-count', '1');
    await expect(rapid).toHaveAttribute('data-dominant', 'true');
    await expect(rapid).toHaveCSS('z-index', '1');
    await expect(page.getByTestId('landscape-ticker-casing-free_rapid')).toBeVisible();
    await expect(page.locator('[data-testid^="landscape-ticker-marker-halo-free_rapid-"]')).not.toHaveCount(0);
    await expect(page.getByTestId('landscape-ticker-path-accl')).toHaveCount(0);
    await expect(page.getByTestId('landscape-ticker-category-rapid')).toHaveAttribute(
      'data-dominant',
      'true',
    );

    await acclControl.click();
    await page.clock.fastForward(1800);

    await expect(acclControl).toHaveAttribute('aria-pressed', 'true');
    await expect(acclControl).toHaveAttribute('data-selected', 'true');
    await expect(acclControl).toHaveAttribute('data-empty', 'true');
    await expect(acclControl).toHaveAttribute('data-point-count', '0');
    await expect(acclControl).toHaveAttribute('data-dominant', 'false');
    await expect(page.getByTestId('landscape-ticker-path-accl')).toHaveCount(0);
    await expect(page.locator('[data-testid^="landscape-ticker-marker-accl-"]')).toHaveCount(0);
    await expect(chart).toHaveAttribute('data-dominant-category', 'free_rapid');
    await expect(chart).toHaveAttribute('data-dominance-order', 'free_rapid');
    await expect(chart).toHaveAttribute('data-painted-count', '1');
    await expect(drawer).toHaveAttribute('data-dominant-category', 'free_rapid');
    await expect(drawer).toHaveAttribute('data-dominance-order', 'free_rapid accl');
    await expect(rapid).toHaveAttribute('data-dominant', 'true');
    await expect(rapid).toHaveAttribute('data-emphasis', 'settled-front');
    await expect(rapid).toHaveCSS('z-index', '1');
    await expect(page.getByTestId('landscape-ticker-casing-free_rapid')).toBeVisible();
    await expect(page.locator('[data-testid^="landscape-ticker-marker-halo-free_rapid-"]')).not.toHaveCount(0);

    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.clock.fastForward(1800);
    const blitz = page.getByTestId('landscape-ticker-path-free_blitz');
    await expect(chart).toHaveAttribute('data-dominant-category', 'free_blitz');
    await expect(chart).toHaveAttribute('data-dominance-order', 'free_rapid free_blitz');
    await expect(chart).toHaveAttribute('data-painted-count', '2');
    await expect(blitz).toHaveAttribute('data-dominant', 'true');
    await expect(blitz).toHaveCSS('z-index', '2');
    await expect(rapid).toHaveCSS('z-index', '1');
    await expect(page.getByTestId('landscape-ticker-path-accl')).toHaveCount(0);

    const paintedBefore = await chart.getAttribute('data-dominance-order');
    await acclControl.click();
    await expect(acclControl).toHaveAttribute('aria-pressed', 'false');
    await expect(chart).toHaveAttribute('data-dominance-order', paintedBefore ?? '');
    await expect(blitz).toHaveAttribute('data-dominant', 'true');
    await acclControl.click();
    await page.clock.fastForward(1800);
    await expect(acclControl).toHaveAttribute('aria-pressed', 'true');
    await expect(chart).toHaveAttribute('data-dominance-order', paintedBefore ?? '');
    await expect(chart).toHaveAttribute('data-dominant-category', 'free_blitz');
    await expect(page.getByTestId('landscape-ticker-path-accl')).toHaveCount(0);
    await expect(blitz).toHaveCSS('z-index', '2');
    await expect(rapid).toHaveCSS('z-index', '1');
  });

  test('all selected categories with zero drawable points paint nothing', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { crossing: true, viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);
    const chart = page.getByTestId('landscape-ticker-chart');

    await page.getByTestId('landscape-ticker-category-accl').click();
    await page.getByTestId('landscape-ticker-category-tournament').click();
    await page.getByTestId('landscape-ticker-category-bullet').click();
    await page.clock.fastForward(1800);
    await page.clock.fastForward(1800);
    await page.clock.fastForward(1800);

    await expect(page.getByTestId('landscape-ticker-category-accl')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('landscape-ticker-category-tournament')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('landscape-ticker-category-bullet')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('[data-testid^="landscape-ticker-path-"]')).toHaveCount(0);
    await expect(chart).toHaveAttribute('data-dominant-category', 'none');
    await expect(chart).toHaveAttribute('data-dominance-order', 'none');
    await expect(chart).toHaveAttribute('data-painted-count', '0');
    await expect(page.getByTestId('expanded-rating-ticker-drawer')).toHaveAttribute(
      'data-dominant-category',
      'none',
    );
    await expect(page.getByTestId('landscape-ticker-zero-event-plot')).toBeVisible();
    await expect(page.getByTestId('landscape-ticker-category-accl')).toHaveAttribute(
      'data-dominant',
      'false',
    );
  });
});
