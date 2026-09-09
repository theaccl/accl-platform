import { expect, test } from '@playwright/test';

import { LANDSCAPE_TICKER_CATEGORIES } from '../../lib/profile/landscapeTickerCategories';
import { LANDSCAPE_TICKER_CASING_STROKE } from '../../lib/profile/landscapeTickerHierarchy';
import { mountLandscapeTicker } from '../helpers/mountLandscapeTickerPage';

const blitzColor =
  LANDSCAPE_TICKER_CATEGORIES.find((cat) => cat.id === 'free_blitz')?.color ?? '';
const rapidColor =
  LANDSCAPE_TICKER_CATEGORIES.find((cat) => cat.id === 'free_rapid')?.color ?? '';

function hexToRgb(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

test.describe('landscape ticker visual hierarchy', () => {
  test('dominant line alone has casing; older cores stay thinner', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.clock.fastForward(1800);
    await page.getByTestId('landscape-ticker-category-rapid').click();
    await page.clock.fastForward(1800);

    const blitz = page.getByTestId('landscape-ticker-path-free_blitz');
    const rapid = page.getByTestId('landscape-ticker-path-free_rapid');
    await expect(rapid).toHaveAttribute('data-dominant', 'true');
    await expect(rapid).toHaveAttribute('data-emphasis', 'settled-front');
    await expect(blitz).toHaveAttribute('data-dominant', 'false');
    await expect(blitz).toHaveAttribute('data-emphasis', 'settled-back');
    await expect(page.getByTestId('landscape-ticker-casing-free_rapid')).toBeVisible();
    await expect(page.getByTestId('landscape-ticker-casing-free_blitz')).toHaveCount(0);
    await expect(rapid).toHaveAttribute('data-casing-width', '4.35');
    await expect(blitz).toHaveAttribute('data-casing-width', '0');
    const blitzCore = Number(await blitz.getAttribute('data-core-width'));
    const rapidCore = Number(await rapid.getAttribute('data-core-width'));
    expect(blitzCore).toBeLessThanOrEqual(2.25);
    expect(rapidCore).toBeGreaterThan(blitzCore);

    await expect(page.getByTestId('landscape-ticker-core-free_rapid')).toHaveAttribute(
      'stroke',
      rapidColor,
    );
    await expect(page.getByTestId('landscape-ticker-casing-free_rapid')).toHaveAttribute(
      'stroke',
      LANDSCAPE_TICKER_CASING_STROKE,
    );
    await expect(page.getByTestId('landscape-ticker-category-rapid')).toHaveAttribute(
      'data-dominant',
      'true',
    );
    await expect(page.getByTestId('landscape-ticker-category-blitz')).toHaveAttribute(
      'data-dominant',
      'false',
    );
    await expect(page.getByTestId('landscape-ticker-core-free_blitz')).toHaveAttribute(
      'stroke',
      blitzColor,
    );
    await expect(page.getByTestId('landscape-ticker-category-rapid')).toHaveCSS(
      'color',
      hexToRgb(rapidColor),
    );
  });

  test('active introduction recesses older lines without dropping contrast, then settles front-most', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.clock.fastForward(1800);
    await page.getByTestId('landscape-ticker-category-rapid').click();

    const blitz = page.getByTestId('landscape-ticker-path-free_blitz');
    const rapid = page.getByTestId('landscape-ticker-path-free_rapid');
    await expect(rapid).toHaveAttribute('data-reveal-phase', 'hero');
    await expect(rapid).toHaveAttribute('data-emphasis', 'hero');
    await expect(rapid).toHaveAttribute('data-dominant', 'true');
    await expect(blitz).toHaveAttribute('data-recessed', 'true');
    await expect(blitz).toHaveAttribute('data-emphasis', 'recessed');
    const recessedOpacity = Number(
      await page.getByTestId('landscape-ticker-core-free_blitz').getAttribute('opacity'),
    );
    expect(recessedOpacity).toBeGreaterThanOrEqual(0.75);
    await expect(page.getByTestId('landscape-ticker-category-rapid')).toHaveAttribute(
      'data-subject',
      'true',
    );
    await expect(page.getByTestId('landscape-ticker-category-blitz')).toHaveAttribute(
      'data-subject',
      'false',
    );
    await expect(page.getByTestId('landscape-ticker-bloom-free_rapid')).toBeVisible();
    const offsetOk = await page.getByTestId('landscape-ticker-chart').getAttribute('data-offset-path');
    if (offsetOk === 'true') {
      await expect(page.locator('[data-testid^="landscape-ticker-spark-free_rapid"]')).toHaveCount(4);
    }

    await page.clock.fastForward(1800);
    await expect(blitz).toHaveAttribute('data-recessed', 'false');
    await expect(blitz).toHaveAttribute('data-emphasis', 'settled-back');
    await expect(rapid).toHaveAttribute('data-emphasis', 'settled-front');
    await expect(rapid).toHaveAttribute('data-dominant', 'true');
    await expect(page.getByTestId('landscape-ticker-category-rapid')).toHaveAttribute(
      'data-subject',
      'false',
    );
    await expect(page.getByTestId('landscape-ticker-marker-halo-free_rapid-r-2')).toBeVisible();
    await expect(page.getByTestId('landscape-ticker-marker-halo-free_blitz-bz-3')).toHaveCount(0);
  });

  test('quiet reselection uses a smaller bloom and skips sparks and perimeter pulse', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.clock.fastForward(1800);
    await page.getByTestId('landscape-ticker-category-rapid').click();
    await page.clock.fastForward(1800);
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.getByTestId('landscape-ticker-category-blitz').click();

    const drawer = page.getByTestId('expanded-rating-ticker-drawer');
    await expect(drawer).toHaveAttribute('data-active-reveal', 'quiet');
    await expect(page.getByTestId('landscape-ticker-path-free_blitz')).toHaveAttribute(
      'data-emphasis',
      'quiet',
    );
    await expect(page.getByTestId('landscape-ticker-path-free_rapid')).toHaveAttribute(
      'data-recessed',
      'true',
    );
    await expect(page.getByTestId('landscape-ticker-quiet-bloom-free_blitz')).toBeVisible();
    await expect(page.getByTestId('landscape-ticker-bloom-free_blitz')).toHaveCount(0);
    await expect(page.locator('[data-testid^="landscape-ticker-spark-"]')).toHaveCount(0);
    await expect(page.getByTestId('landscape-ticker-perimeter')).toHaveAttribute(
      'data-pulse-active',
      'false',
    );
    await expect(page.getByTestId('landscape-ticker-chart')).toHaveAttribute(
      'data-hero-pulse-serial',
      'none',
    );
    await expect(page.getByTestId('landscape-ticker-category-blitz')).toHaveAttribute(
      'data-subject',
      'true',
    );
    await expect(page.getByTestId('landscape-ticker-category-blitz')).toHaveAttribute(
      'data-dominant',
      'true',
    );

    await page.clock.fastForward(800);
    await expect(drawer).toHaveAttribute('data-active-reveal', 'none');
    await expect(page.getByTestId('landscape-ticker-path-free_blitz')).toHaveAttribute(
      'data-emphasis',
      'settled-front',
    );
    await expect(page.getByTestId('landscape-ticker-path-free_rapid')).toHaveAttribute(
      'data-recessed',
      'false',
    );
    await expect(page.getByTestId('landscape-ticker-quiet-bloom-free_blitz')).toHaveCount(0);
  });

  test('reduced motion skips recess and lands in front-most settled state', async ({ page }) => {
    await mountLandscapeTicker(page, {
      viewport: { width: 800, height: 360 },
      reducedMotion: true,
    });
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.getByTestId('landscape-ticker-category-rapid').click();
    await expect(page.getByTestId('landscape-ticker-path-free_rapid')).toHaveAttribute(
      'data-emphasis',
      'settled-front',
    );
    await expect(page.getByTestId('landscape-ticker-path-free_blitz')).toHaveAttribute(
      'data-emphasis',
      'settled-back',
    );
    await expect(page.getByTestId('landscape-ticker-path-free_blitz')).toHaveAttribute(
      'data-recessed',
      'false',
    );
    await expect(page.locator('[data-testid^="landscape-ticker-bloom-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="landscape-ticker-quiet-bloom-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="landscape-ticker-spark-"]')).toHaveCount(0);
    await expect(page.getByTestId('landscape-ticker-casing-free_rapid')).toBeVisible();
    await expect(page.getByTestId('landscape-ticker-casing-free_blitz')).toHaveCount(0);
  });
});
