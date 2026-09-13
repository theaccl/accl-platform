import { expect, test, type Page } from '@playwright/test';

import { mountLandscapeTicker } from '../helpers/mountLandscapeTickerPage';

async function openMonthLane(page: Page) {
  await page.getByTestId('rating-lane-tab-month').click();
}

async function ownerAtPathMid(page: Page, seriesId: string) {
  return page.evaluate((id) => {
    const core = document.querySelector<SVGPathElement>(`[data-testid="landscape-ticker-core-${id}"]`);
    if (!core) return { owner: null, hit: null, dominant: null, reason: 'missing-core' };
    const len = core.getTotalLength();
    const pt = core.getPointAtLength(Math.max(1, len / 2));
    const ctm = core.getScreenCTM();
    if (!ctm) return { owner: null, hit: null, dominant: null, reason: 'missing-ctm' };
    const x = ctm.a * pt.x + ctm.c * pt.y + ctm.e;
    const y = ctm.b * pt.x + ctm.d * pt.y + ctm.f;
    const el = document.elementFromPoint(x, y);
    const group = el?.closest('[data-testid^="landscape-ticker-path-"]');
    return {
      owner: group?.getAttribute('data-testid') ?? null,
      hit: el?.getAttribute('data-testid') ?? null,
      dominant: group?.getAttribute('data-dominant') ?? null,
      reason: 'ok',
    };
  }, seriesId);
}

test.describe('landscape ticker carry-in drawable dominance', () => {
  test('real-event Rapid plus carry-in-only Blitz selected last is Blitz-dominant with Rapid keyboard only', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { carryIn: true, viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);
    await openMonthLane(page);

    const chart = page.getByTestId('landscape-ticker-chart');
    const drawer = page.getByTestId('expanded-rating-ticker-drawer');

    await page.getByTestId('landscape-ticker-category-rapid').click();
    await page.clock.fastForward(1800);
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.clock.fastForward(1800);

    const rapid = page.getByTestId('landscape-ticker-path-free_rapid');
    const blitz = page.getByTestId('landscape-ticker-path-free_blitz');
    await expect(blitz).toBeVisible();
    await expect(blitz).toHaveAttribute('data-dominant', 'true');
    await expect(blitz).toHaveAttribute('data-carry-in-only', 'true');
    await expect(blitz).toHaveAttribute('data-emphasis', 'settled-front');
    await expect(blitz).toHaveCSS('z-index', '2');
    await expect(blitz).toHaveAttribute('data-paint-index', '1');
    await expect(rapid).toHaveAttribute('data-dominant', 'false');
    await expect(rapid).toHaveAttribute('data-carry-in-only', 'false');
    await expect(rapid).toHaveCSS('z-index', '1');
    await expect(rapid).toHaveAttribute('data-paint-index', '0');
    await expect(page.getByTestId('landscape-ticker-casing-free_blitz')).toHaveCount(1);
    await expect(chart).toHaveAttribute('data-dominant-category', 'free_blitz');
    await expect(chart).toHaveAttribute('data-dominance-order', 'free_rapid free_blitz');
    await expect(chart).toHaveAttribute('data-dominant-carry-in', 'true');
    await expect(chart).toHaveAttribute('data-drawable-count', '2');
    await expect(chart).toHaveAttribute('data-painted-count', '2');
    await expect(chart).toHaveAttribute('data-marked-count', '1');
    await expect(drawer).toHaveAttribute('data-dominant-category', 'free_blitz');
    await expect(page.getByTestId('landscape-ticker-category-blitz')).toHaveAttribute(
      'data-dominant',
      'true',
    );
    await expect(page.getByTestId('landscape-ticker-category-blitz')).toHaveAttribute(
      'data-carry-in',
      'true',
    );
    await expect(page.getByTestId('landscape-ticker-category-blitz')).toHaveAttribute(
      'data-drawable',
      'true',
    );
    await expect(page.getByTestId('landscape-ticker-category-blitz')).toHaveAttribute(
      'data-empty',
      'true',
    );
    await expect(page.getByTestId('landscape-ticker-category-rapid')).toHaveAttribute(
      'data-dominant',
      'false',
    );
    await expect(page.locator('[data-testid^="landscape-ticker-marker-free_blitz-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="landscape-ticker-marker-halo-free_blitz-"]')).toHaveCount(
      0,
    );
    await expect(page.locator('[data-testid^="landscape-ticker-marker-free_rapid-"]')).toHaveCount(2);

    const overlap = await ownerAtPathMid(page, 'free_blitz');
    expect(overlap.owner).toBe('landscape-ticker-path-free_blitz');
    expect(overlap.hit).toBe('landscape-ticker-hit-free_blitz');
    expect(overlap.dominant).toBe('true');
    await page.getByTestId('landscape-ticker-hit-free_blitz').click({ force: true });
    await expect(page.getByTestId('landscape-ticker-point-detail')).toHaveCount(0);

    await page.getByTestId('landscape-ticker-chart-focus').focus();
    await page.keyboard.press('Home');
    await expect(page.getByTestId('landscape-ticker-point-detail')).toBeVisible();
    await expect(page.getByTestId('landscape-ticker-point-iso')).toHaveText('2026-08-10T12:00:00Z');
    await page.keyboard.press('End');
    await expect(page.getByTestId('landscape-ticker-point-iso')).toHaveText('2026-08-18T15:00:00Z');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('landscape-ticker-point-iso')).toHaveText('2026-08-10T12:00:00Z');
  });

  test('deselect and reselect carry-in-only Blitz is a quiet reveal back to front with no fake marker', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { carryIn: true, viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);
    await openMonthLane(page);
    await page.getByTestId('landscape-ticker-category-rapid').click();
    await page.clock.fastForward(1800);
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.clock.fastForward(1800);

    await page.getByTestId('landscape-ticker-category-blitz').click();
    await expect(page.getByTestId('landscape-ticker-path-free_blitz')).toHaveCount(0);
    await page.getByTestId('landscape-ticker-category-blitz').click();

    const blitz = page.getByTestId('landscape-ticker-path-free_blitz');
    await expect(blitz).toHaveAttribute('data-reveal-phase', 'quiet');
    await expect(blitz).toHaveAttribute('data-emphasis', 'quiet');
    await expect(blitz).toHaveAttribute('data-dominant', 'true');
    await expect(blitz).toHaveAttribute('data-carry-in-only', 'true');
    await expect(page.getByTestId('landscape-ticker-chart')).toHaveAttribute(
      'data-dominant-category',
      'free_blitz',
    );
    await expect(page.locator('[data-testid^="landscape-ticker-marker-free_blitz-"]')).toHaveCount(0);
    await expect(page.getByTestId('landscape-ticker-quiet-bloom-free_blitz')).toHaveCount(0);
    await expect(page.getByTestId('landscape-ticker-point-detail')).toHaveCount(0);

    await page.clock.fastForward(800);
    await expect(blitz).toHaveAttribute('data-emphasis', 'settled-front');
    await expect(blitz).toHaveCSS('z-index', '2');
    await expect(page.getByTestId('landscape-ticker-path-free_rapid')).toHaveCSS('z-index', '1');
    await expect(page.getByTestId('landscape-ticker-point-detail')).toHaveCount(0);
  });

  test('carry-in-only Rapid followed by real-event Blitz makes Blitz dominant', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, {
      carryInRapid: true,
      viewport: { width: 800, height: 360 },
    });
    await page.clock.fastForward(50);
    await openMonthLane(page);
    await page.getByTestId('landscape-ticker-category-rapid').click();
    await page.clock.fastForward(1800);
    const chart = page.getByTestId('landscape-ticker-chart');
    await expect(chart).toHaveAttribute('data-dominant-category', 'free_rapid');
    await expect(chart).toHaveAttribute('data-dominant-carry-in', 'true');
    await expect(page.getByTestId('landscape-ticker-path-free_rapid')).toHaveAttribute(
      'data-carry-in-only',
      'true',
    );
    await expect(page.locator('[data-testid^="landscape-ticker-marker-free_rapid-"]')).toHaveCount(0);

    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.clock.fastForward(1800);
    await expect(chart).toHaveAttribute('data-dominant-category', 'free_blitz');
    await expect(chart).toHaveAttribute('data-dominant-carry-in', 'false');
    await expect(chart).toHaveAttribute('data-dominance-order', 'free_rapid free_blitz');
    await expect(page.getByTestId('landscape-ticker-path-free_blitz')).toHaveAttribute(
      'data-dominant',
      'true',
    );
    await expect(page.getByTestId('landscape-ticker-path-free_rapid')).toHaveAttribute(
      'data-dominant',
      'false',
    );
    await expect(page.locator('[data-testid^="landscape-ticker-marker-free_blitz-"]')).toHaveCount(2);
  });

  test('two carry-in-only series keep contiguous z-indices and newest drawable dominant', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { carryIn: true, viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);
    await openMonthLane(page);
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.clock.fastForward(1800);
    await page.getByTestId('landscape-ticker-category-daily').click();
    await page.clock.fastForward(1800);

    const chart = page.getByTestId('landscape-ticker-chart');
    const blitz = page.getByTestId('landscape-ticker-path-free_blitz');
    const daily = page.getByTestId('landscape-ticker-path-free_day');
    await expect(chart).toHaveAttribute('data-dominant-category', 'free_day');
    await expect(chart).toHaveAttribute('data-dominance-order', 'free_blitz free_day');
    await expect(chart).toHaveAttribute('data-drawable-count', '2');
    await expect(chart).toHaveAttribute('data-marked-count', '0');
    await expect(chart).toHaveAttribute('data-dominant-carry-in', 'true');
    await expect(blitz).toHaveAttribute('data-paint-index', '0');
    await expect(daily).toHaveAttribute('data-paint-index', '1');
    await expect(blitz).toHaveCSS('z-index', '1');
    await expect(daily).toHaveCSS('z-index', '2');
    await expect(daily).toHaveAttribute('data-dominant', 'true');
    await expect(page.locator('[data-testid^="landscape-ticker-marker-"]')).toHaveCount(0);
    await page.getByTestId('landscape-ticker-chart-focus').focus();
    await page.keyboard.press('Home');
    await expect(page.getByTestId('landscape-ticker-point-detail')).toHaveCount(0);
  });

  test('truly history-empty category selected last does not displace dominance or open a z-gap', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { carryIn: true, viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);
    await openMonthLane(page);
    await page.getByTestId('landscape-ticker-category-rapid').click();
    await page.clock.fastForward(1800);
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.clock.fastForward(1800);

    const chart = page.getByTestId('landscape-ticker-chart');
    const accl = page.getByTestId('landscape-ticker-category-accl');
    await accl.click();
    await page.clock.fastForward(1800);
    await expect(accl).toHaveAttribute('aria-pressed', 'true');
    await expect(accl).toHaveAttribute('data-empty', 'true');
    await expect(accl).toHaveAttribute('data-drawable', 'false');
    await expect(accl).toHaveAttribute('data-carry-in', 'false');
    await expect(accl).toHaveAttribute('data-dominant', 'false');
    await expect(page.getByTestId('landscape-ticker-path-accl')).toHaveCount(0);
    await expect(chart).toHaveAttribute('data-dominant-category', 'free_blitz');
    await expect(chart).toHaveAttribute('data-dominance-order', 'free_rapid free_blitz');
    await expect(page.getByTestId('expanded-rating-ticker-drawer')).toHaveAttribute(
      'data-dominance-order',
      'free_rapid free_blitz accl',
    );
    await expect(page.getByTestId('landscape-ticker-path-free_blitz')).toHaveCSS('z-index', '2');
    await expect(page.getByTestId('landscape-ticker-path-free_rapid')).toHaveCSS('z-index', '1');
    await expect(page.getByTestId('landscape-ticker-path-free_blitz')).toHaveAttribute(
      'data-paint-index',
      '1',
    );
  });

  test('all selected categories truly history-empty have no painted dominant', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { carryIn: true, viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);
    await openMonthLane(page);
    const chart = page.getByTestId('landscape-ticker-chart');
    await page.getByTestId('landscape-ticker-category-accl').click();
    await page.getByTestId('landscape-ticker-category-tournament').click();
    await page.getByTestId('landscape-ticker-category-bullet').click();
    await page.clock.fastForward(1800);
    await page.clock.fastForward(1800);
    await page.clock.fastForward(1800);
    await expect(page.locator('[data-testid^="landscape-ticker-path-"]')).toHaveCount(0);
    await expect(chart).toHaveAttribute('data-dominant-category', 'none');
    await expect(chart).toHaveAttribute('data-dominance-order', 'none');
    await expect(chart).toHaveAttribute('data-painted-count', '0');
    await expect(chart).toHaveAttribute('data-drawable-count', '0');
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

  test('reduced motion lands carry-in-only selection in drawable dominance immediately', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, {
      carryIn: true,
      viewport: { width: 800, height: 360 },
      reducedMotion: true,
    });
    await page.clock.fastForward(50);
    await openMonthLane(page);
    await page.getByTestId('landscape-ticker-category-rapid').click();
    await page.getByTestId('landscape-ticker-category-blitz').click();
    const chart = page.getByTestId('landscape-ticker-chart');
    await expect(chart).toHaveAttribute('data-dominant-category', 'free_blitz');
    await expect(page.getByTestId('landscape-ticker-path-free_blitz')).toHaveAttribute(
      'data-emphasis',
      'settled-front',
    );
    await expect(page.getByTestId('landscape-ticker-path-free_blitz')).toHaveAttribute(
      'data-carry-in-only',
      'true',
    );
    await expect(page.getByTestId('landscape-ticker-path-free_rapid')).toHaveAttribute(
      'data-recessed',
      'false',
    );
    await expect(page.getByTestId('landscape-ticker-path-free_blitz')).toHaveCSS('z-index', '2');
    await expect(page.locator('[data-testid^="landscape-ticker-marker-free_blitz-"]')).toHaveCount(0);
  });

  test('close remount and lane changes preserve session doctrine around carry-in dominance', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { carryIn: true, viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);
    await openMonthLane(page);
    await page.getByTestId('landscape-ticker-category-rapid').click();
    await page.clock.fastForward(1800);
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.clock.fastForward(1800);
    const chart = page.getByTestId('landscape-ticker-chart');
    const drawer = page.getByTestId('expanded-rating-ticker-drawer');
    await expect(chart).toHaveAttribute('data-dominant-category', 'free_blitz');

    await page.getByTestId('rating-lane-tab-year').click();
    await expect(drawer).toHaveAttribute('data-dominance-order', 'free_rapid free_blitz');
    await expect(chart).toHaveAttribute('data-dominant-category', 'free_blitz');
    await expect(chart).toHaveAttribute('data-dominant-carry-in', 'false');
    await expect(page.getByTestId('landscape-ticker-path-free_blitz')).toHaveAttribute(
      'data-carry-in-only',
      'false',
    );

    await page.getByTestId('rating-lane-tab-month').click();
    await expect(chart).toHaveAttribute('data-dominant-category', 'free_blitz');
    await expect(chart).toHaveAttribute('data-dominant-carry-in', 'true');
    await expect(page.getByTestId('landscape-ticker-path-free_blitz')).toHaveAttribute(
      'data-carry-in-only',
      'true',
    );

    await page.getByTestId('expanded-ticker-close').click();
    await page.getByTestId('rating-ticker-expand-mobile').click();
    await expect(drawer).toHaveAttribute('data-dominance-order', 'none');
    await expect(drawer).toHaveAttribute('data-selected-count', '0');
    await expect(chart).toHaveAttribute('data-dominant-category', 'none');
    await expect(chart).toHaveAttribute('data-empty-open', 'true');
  });
});
