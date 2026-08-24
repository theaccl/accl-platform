import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { cssSupportsOffsetPath, landscapeTickerRevealTimerKey } from '../../lib/profile/landscapeTickerMotion';
import { isMaterialViewportChange } from '../../lib/profile/landscapeTickerViewport';
import { BLITZ_RAPID_CROSS_U, DAILY_RAPID_FIRST_CROSS_U } from '../helpers/landscapeTickerCrossingFixture';
import { mountLandscapeTicker } from '../helpers/mountLandscapeTickerPage';

type Box = { top: number; left: number; right: number; bottom: number; width: number; height: number };

function toBox(rect: { x: number; y: number; width: number; height: number }): Box {
  return {
    left: rect.x,
    top: rect.y,
    right: rect.x + rect.width,
    bottom: rect.y + rect.height,
    width: rect.width,
    height: rect.height,
  };
}

function fullyInViewport(box: Box, vw: number, vh: number, slop = 1): boolean {
  return (
    box.left >= -slop &&
    box.top >= -slop &&
    box.right <= vw + slop &&
    box.bottom <= vh + slop &&
    box.width > 0 &&
    box.height > 0
  );
}

function notClippedBy(inner: Box, outer: Box, slop = 1): boolean {
  return (
    inner.left >= outer.left - slop &&
    inner.right <= outer.right + slop &&
    inner.top >= outer.top - slop &&
    inner.bottom <= outer.bottom + slop
  );
}

async function ownerAtSeriesCrossing(
  page: Page,
  seriesId: 'free_blitz' | 'free_rapid' | 'free_day',
  u: number,
) {
  return page.evaluate(
    ({ seriesId: id, u: frac }) => {
      const markers = [...document.querySelectorAll<SVGCircleElement>(`[data-testid^="landscape-ticker-marker-${id}-"]`)]
        .map((el) => ({
          cx: Number(el.getAttribute('cx')),
          cy: Number(el.getAttribute('cy')),
        }))
        .filter((pt) => Number.isFinite(pt.cx) && Number.isFinite(pt.cy))
        .sort((a, b) => a.cx - b.cx);
      const rapidCount = document.querySelectorAll('[data-testid^="landscape-ticker-marker-free_rapid-"]').length;
      const dailyCount = document.querySelectorAll('[data-testid^="landscape-ticker-marker-free_day-"]').length;
      if (markers.length < 2) {
        return { owner: null, dominant: null, reason: 'missing-markers', rapidCount, dailyCount };
      }
      const x = markers[0].cx + frac * (markers[1].cx - markers[0].cx);
      const y = markers[0].cy + frac * (markers[1].cy - markers[0].cy);
      const layer = document.querySelector(`[data-testid="landscape-ticker-path-${id}"]`);
      const svg =
        layer instanceof SVGSVGElement
          ? layer
          : (layer?.closest('svg') ??
            document.querySelector<SVGSVGElement>('[data-testid="landscape-ticker-chart-focus"]'));
      const ctm = svg?.getScreenCTM();
      if (!svg || !ctm) {
        return { owner: null, dominant: null, reason: 'missing-svg', rapidCount, dailyCount };
      }
      const pt = svg.createSVGPoint();
      pt.x = x;
      pt.y = y;
      const screen = pt.matrixTransform(ctm);
      const el = document.elementFromPoint(screen.x, screen.y);
      const group = el?.closest('[data-testid^="landscape-ticker-path-"]');
      return {
        owner: group?.getAttribute('data-testid') ?? null,
        dominant: group?.getAttribute('data-dominant') ?? null,
        reason: 'ok',
        rapidCount,
        dailyCount,
      };
    },
    { seriesId, u },
  );
}

function landscapeTickerCaptureDir(testInfo: TestInfo): string | null {
  const raw = process.env.LANDSCAPE_TICKER_CAPTURE_DIR?.trim();
  if (!raw) return null;
  if (raw === '1' || raw.toLowerCase() === 'true' || raw === 'playwright-output') {
    return testInfo.outputPath('actual-component');
  }
  return raw;
}

test.describe('landscape ticker viewport helpers', () => {
  test('internal-sized boxes are not material viewport changes', () => {
    expect(isMaterialViewportChange({ width: 800, height: 360 }, { width: 800, height: 360 })).toBe(
      false,
    );
    expect(isMaterialViewportChange({ width: 800, height: 360 }, { width: 804, height: 358 })).toBe(
      false,
    );
  });

  test('genuine dimension changes are material', () => {
    expect(isMaterialViewportChange({ width: 360, height: 800 }, { width: 800, height: 360 })).toBe(
      true,
    );
    expect(isMaterialViewportChange({ width: 800, height: 360 }, { width: 667, height: 375 })).toBe(
      true,
    );
  });

  test('reveal timer key ignores series object identity', () => {
    expect(landscapeTickerRevealTimerKey(3, 'hero')).toBe('3:hero');
    expect(landscapeTickerRevealTimerKey(3, 'quiet')).toBe('3:quiet');
    expect(landscapeTickerRevealTimerKey(3, 'settled')).toBeNull();
    expect(landscapeTickerRevealTimerKey(null, 'hero')).toBeNull();
    expect(cssSupportsOffsetPath(undefined)).toBe(false);
    expect(cssSupportsOffsetPath({ supports: () => false })).toBe(false);
    expect(
      cssSupportsOffsetPath({
        supports: (property) => property === 'offset-path',
      }),
    ).toBe(true);
  });
});

test.describe('landscape ticker actual-component DOM behavior', () => {
  test('empty opening, category aria-pressed, and first hero complete', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);

    const drawer = page.getByTestId('expanded-rating-ticker-drawer');
    await expect(drawer).toBeVisible();
    await expect(page.getByTestId('landscape-ticker-empty-plot')).toBeVisible();
    await expect(drawer).toHaveAttribute('data-selected-count', '0');
    await expect(drawer).toHaveAttribute('data-active-reveal', 'none');
    await expect(page.getByTestId('landscape-ticker-category-blitz')).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await page.getByTestId('landscape-ticker-category-blitz').click();
    await expect(page.getByTestId('landscape-ticker-category-blitz')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(drawer).toHaveAttribute('data-active-reveal', 'hero');
    await expect(page.getByTestId('landscape-ticker-chart')).toHaveAttribute(
      'data-hero-pulse-serial',
      '1',
    );

    await page.clock.fastForward(1800);
    await expect(drawer).toHaveAttribute('data-active-reveal', 'none');
    await expect(page.getByTestId('rating-ticker-point-list')).toBeAttached();
    await expect(page.getByTestId('rating-ticker-point-list')).not.toBeVisible();
    await expect(page.getByTestId('landscape-ticker-chart')).toHaveAttribute(
      'data-hero-pulse-serial',
      'none',
    );
  });

  test('quiet reselection produces no perimeter pulse', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.clock.fastForward(1800);
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await expect(page.getByTestId('expanded-rating-ticker-drawer')).toHaveAttribute(
      'data-active-reveal',
      'quiet',
    );
    await expect(page.getByTestId('landscape-ticker-chart')).toHaveAttribute(
      'data-hero-pulse-serial',
      'none',
    );
    await expect(page.getByTestId('landscape-ticker-perimeter')).toHaveAttribute(
      'data-pulse-active',
      'false',
    );
  });

  test('reduced motion settles immediately without pulse or motion-path head', async ({ page }) => {
    await mountLandscapeTicker(page, {
      viewport: { width: 800, height: 360 },
      reducedMotion: true,
    });
    await page.getByTestId('landscape-ticker-category-rapid').click();
    const drawer = page.getByTestId('expanded-rating-ticker-drawer');
    await expect(drawer).toHaveAttribute('data-reduced-motion', 'true');
    await expect(drawer).toHaveAttribute('data-active-reveal', 'none');
    await expect(page.getByTestId('landscape-ticker-category-rapid')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('landscape-ticker-chart')).toHaveAttribute(
      'data-hero-pulse-serial',
      'none',
    );
    await expect(page.locator('[data-testid^="landscape-ticker-head-"]')).toHaveCount(0);
  });

  test('internal point-list reflow does not settle hero or queued reveals', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.getByTestId('landscape-ticker-category-bullet').click();
    await expect(page.getByTestId('rating-ticker-point-list')).toBeAttached();
    await expect(page.getByTestId('rating-ticker-point-list')).not.toBeVisible();
    await expect(page.getByTestId('rating-ticker-point-list').locator('li')).toHaveCount(3);
    await page.clock.fastForward(400);
    const drawer = page.getByTestId('expanded-rating-ticker-drawer');
    await expect(drawer).toHaveAttribute('data-active-reveal', 'hero');
    await expect(drawer).toHaveAttribute('data-queued-count', '1');
    await expect(page.getByTestId('landscape-ticker-category-bullet')).toHaveAttribute(
      'data-queued',
      'true',
    );
    await page.clock.fastForward(1400);
    await expect(drawer).toHaveAttribute('data-active-reveal', 'hero');
    await expect(page.getByTestId('landscape-ticker-category-bullet')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('landscape-ticker-chart')).toHaveAttribute(
      'data-hero-pulse-serial',
      '2',
    );
  });

  test('genuine viewport dimension change settles active and queued lines', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.getByTestId('landscape-ticker-category-rapid').click();
    await expect(page.getByTestId('expanded-rating-ticker-drawer')).toHaveAttribute(
      'data-active-reveal',
      'hero',
    );
    await page.setViewportSize({ width: 667, height: 375 });
    await page.clock.fastForward(50);
    const drawer = page.getByTestId('expanded-rating-ticker-drawer');
    await expect(drawer).toHaveAttribute('data-active-reveal', 'none');
    await expect(drawer).toHaveAttribute('data-queued-count', '0');
    await expect(page.getByTestId('landscape-ticker-category-blitz')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('landscape-ticker-category-rapid')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('opening measurement does not settle a later full hero', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { viewport: { width: 360, height: 800 }, empty: true });
    await page.clock.fastForward(100);
    await page.evaluate(() => {
      (window as Window & { __tickerHarness?: { setEmpty: (v: boolean) => void } }).__tickerHarness?.setEmpty(
        false,
      );
    });
    await page.getByTestId('landscape-ticker-category-blitz').click();
    const drawer = page.getByTestId('expanded-rating-ticker-drawer');
    await expect(drawer).toHaveAttribute('data-active-reveal', 'hero');
    await page.clock.fastForward(1000);
    await expect(drawer).toHaveAttribute('data-active-reveal', 'hero');
    await page.clock.fastForward(800);
    await expect(drawer).toHaveAttribute('data-active-reveal', 'none');
  });

  test('consecutive heroes emit two distinct perimeter pulse events', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);
    await page.evaluate(() => {
      (window as Window & { __pulses?: number[] }).__pulses = [];
      document.addEventListener('landscape-ticker-hero-pulse', (event) => {
        const detail = (event as CustomEvent<{ serial: number }>).detail;
        (window as Window & { __pulses?: number[] }).__pulses?.push(detail.serial);
      });
    });
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.getByTestId('landscape-ticker-category-bullet').click();
    await page.clock.fastForward(1800);
    await page.clock.fastForward(1800);
    const pulses = await page.evaluate(
      () => (window as Window & { __pulses?: number[] }).__pulses ?? [],
    );
    expect(pulses).toEqual([1, 2]);
    await expect(page.getByTestId('expanded-rating-ticker-drawer')).toHaveAttribute(
      'data-active-reveal',
      'none',
    );
  });

  test('data identity rerender does not restart the hero timer', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);
    await page.getByTestId('landscape-ticker-category-blitz').click();
    const serial = await page.getByTestId('expanded-rating-ticker-drawer').getAttribute(
      'data-active-reveal-serial',
    );
    await page.clock.fastForward(900);
    await page.evaluate(() => {
      (
        window as Window & { __tickerHarness?: { newHistoryIdentity: () => void } }
      ).__tickerHarness?.newHistoryIdentity();
    });
    await expect(page.getByTestId('expanded-rating-ticker-drawer')).toHaveAttribute(
      'data-active-reveal-serial',
      serial ?? '',
    );
    await expect(page.getByTestId('expanded-rating-ticker-drawer')).toHaveAttribute(
      'data-active-reveal',
      'hero',
    );
    await page.clock.fastForward(900);
    await expect(page.getByTestId('expanded-rating-ticker-drawer')).toHaveAttribute(
      'data-active-reveal',
      'none',
    );
  });

  test('lane change during reveal settles into the new range without replay', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.getByTestId('landscape-ticker-category-rapid').click();
    await page.getByTestId('rating-lane-tab-week').click();
    const drawer = page.getByTestId('expanded-rating-ticker-drawer');
    await expect(drawer).toHaveAttribute('data-active-reveal', 'none');
    await expect(page.getByTestId('landscape-ticker-category-blitz')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('landscape-ticker-category-rapid')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('landscape-ticker-chart')).toHaveAttribute(
      'data-hero-pulse-serial',
      'none',
    );
  });

  test('focus containment, Escape, restoration, and stable parent rerender', async ({ page }) => {
    await mountLandscapeTicker(page, { open: false, viewport: { width: 800, height: 360 } });
    const expand = page.getByTestId('rating-ticker-expand-mobile');
    await expand.focus();
    await expand.click();
    const drawer = page.getByTestId('expanded-rating-ticker-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveAttribute('data-captured-focus-once', 'harness-expand');
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    expect(await page.evaluate(() => document.body.dataset.landscapeTickerScrollLock)).toBe(
      'true',
    );

    await page.keyboard.press('Tab');
    const freeFamily = page.getByTestId('landscape-ticker-family-free');
    await expect(freeFamily).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByTestId('landscape-ticker-chart-focus')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(freeFamily).toBeFocused();
    const close = page.getByTestId('expanded-ticker-close');
    await close.focus();
    await expect(close).toBeFocused();

    await page.evaluate(() => {
      const behind = document.createElement('button');
      behind.id = 'outside-focus-probe';
      behind.textContent = 'outside';
      document.body.appendChild(behind);
      behind.focus();
    });
    const returned = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="expanded-rating-ticker-drawer"]');
      return !!root && root.contains(document.activeElement);
    });
    expect(returned).toBe(true);

    const markerTabs = await page.locator('[id^="landscape-ticker-marker-"]').count();
    expect(markerTabs).toBe(0);
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await expect(page.getByTestId('landscape-ticker-chart-focus')).toHaveAttribute('tabindex', '0');
    const markerTabIndexes = await page
      .locator('[id^="landscape-ticker-marker-"]')
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).tabIndex));
    expect(markerTabIndexes.length).toBeGreaterThan(0);
    expect(markerTabIndexes.every((value) => value === -1)).toBe(true);
    await page.getByTestId('landscape-ticker-chart-focus').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('landscape-ticker-point-detail')).toBeVisible();
    await expect(page.getByTestId('landscape-ticker-finished-link')).toBeVisible();
    await expect(page.getByTestId('landscape-ticker-list-finished-link').first()).toBeAttached();
    await expect(page.getByTestId('landscape-ticker-list-finished-link').first()).not.toBeVisible();

    await page.evaluate(() => {
      (
        window as Window & { __tickerHarness?: { rerender: () => void } }
      ).__tickerHarness?.rerender();
    });
    await expect(page.getByTestId('harness-tick')).toHaveText('1');
    await expect(drawer).toHaveAttribute('data-captured-focus-once', 'harness-expand');
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    expect(await page.evaluate(() => document.body.dataset.landscapeTickerScrollLock)).toBe(
      'true',
    );

    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(expand).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  });

  test('unsupported motion-path skips ignition head and sparks', async ({ page }) => {
    await mountLandscapeTicker(page, {
      viewport: { width: 800, height: 360 },
      forceOffsetPath: false,
    });
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await expect(page.getByTestId('landscape-ticker-chart')).toHaveAttribute(
      'data-offset-path',
      'false',
    );
    await expect(page.locator('[data-testid^="landscape-ticker-head-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="landscape-ticker-spark-"]')).toHaveCount(0);
    await expect(page.getByTestId('landscape-ticker-bloom-free_blitz')).toBeVisible();
  });

  test('background pointer interaction is blocked while open', async ({ page }) => {
    await mountLandscapeTicker(page, { viewport: { width: 800, height: 360 } });
    await expect(page.getByTestId('harness-rerender')).toBeVisible();
    const result = await page
      .getByTestId('harness-rerender')
      .click({ timeout: 1500 })
      .then(() => 'clicked')
      .catch(() => 'blocked');
    expect(result).toBe('blocked');
    await expect(page.getByTestId('harness-tick')).toHaveText('0');
  });

  test('family pager has three controls in order and starts on Free', async ({ page }) => {
    await mountLandscapeTicker(page, { viewport: { width: 800, height: 360 } });
    const pager = page.getByTestId('landscape-ticker-family-pager');
    await expect(pager).toBeVisible();
    const ids = await pager.locator('[role="tab"]').evaluateAll((els) =>
      els.map((el) => el.getAttribute('data-family')),
    );
    expect(ids).toEqual(['free', 'battlefield', 'kptv']);
    await expect(page.getByTestId('landscape-ticker-family-free')).toHaveAttribute(
      'aria-label',
      'Free ticker',
    );
    await expect(page.getByTestId('landscape-ticker-family-battlefield')).toHaveAttribute(
      'aria-label',
      'Battlefield ticker',
    );
    await expect(page.getByTestId('landscape-ticker-family-kptv')).toHaveAttribute(
      'aria-label',
      'KPTV ticker',
    );
    const drawer = page.getByTestId('expanded-rating-ticker-drawer');
    await expect(drawer).toHaveAttribute('data-active-family', 'free');
    await expect(page.getByTestId('landscape-ticker-family-free')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('landscape-ticker-family-free')).toHaveAttribute(
      'data-selected',
      'true',
    );
    await expect(page.getByTestId('landscape-ticker-empty-plot')).toBeVisible();
  });

  test('click and keyboard family navigation, reduced motion, and session isolation', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);
    const drawer = page.getByTestId('expanded-rating-ticker-drawer');
    await expect(drawer).toHaveAttribute('data-family-transition', 'slide');

    await page.getByTestId('landscape-ticker-family-battlefield').click();
    await expect(drawer).toHaveAttribute('data-active-family', 'battlefield');
    await expect(page.getByTestId('landscape-ticker-family-battlefield')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('landscape-ticker-family-free')).toHaveAttribute(
      'aria-selected',
      'false',
    );
    await expect(page.getByTestId('landscape-ticker-family-unavailable-battlefield')).toBeVisible();
    await expect(
      page.getByTestId('landscape-ticker-family-panel-battlefield').locator('[data-testid="landscape-ticker-chart"]'),
    ).toHaveCount(0);
    await expect(drawer).toHaveAttribute('data-active-reveal', 'none');
    await expect(drawer).toHaveAttribute('data-selected-count', '0');

    await page.getByTestId('landscape-ticker-family-kptv').click();
    await expect(drawer).toHaveAttribute('data-active-family', 'kptv');
    await expect(page.getByTestId('landscape-ticker-family-unavailable-kptv')).toBeVisible();
    await expect(page.getByTestId('landscape-ticker-family-unavailable-kptv')).toContainText('KPTV ticker');
    await expect(page.getByTestId('landscape-ticker-family-unavailable-kptv')).not.toContainText(
      /Kids|K-12|K12/i,
    );
    await expect(
      page.getByTestId('landscape-ticker-family-panel-kptv').locator('[data-testid="landscape-ticker-chart"]'),
    ).toHaveCount(0);

    await page.getByTestId('landscape-ticker-family-free').click();
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await expect(drawer).toHaveAttribute('data-active-reveal', 'hero');
    await page.getByTestId('landscape-ticker-family-battlefield').click();
    await expect(drawer).toHaveAttribute('data-active-family', 'battlefield');
    await expect(drawer).toHaveAttribute('data-selected-count', '1');
    await expect(drawer).toHaveAttribute('data-active-reveal', 'hero');
    await page.getByTestId('landscape-ticker-family-free').click();
    await expect(page.getByTestId('landscape-ticker-category-blitz')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(drawer).toHaveAttribute('data-active-reveal', 'hero');
    await page.clock.fastForward(1800);
    await expect(drawer).toHaveAttribute('data-active-reveal', 'none');

    await page.getByTestId('landscape-ticker-family-free').focus();
    await page.keyboard.press('ArrowRight');
    await expect(drawer).toHaveAttribute('data-active-family', 'battlefield');
    await page.keyboard.press('ArrowRight');
    await expect(drawer).toHaveAttribute('data-active-family', 'kptv');
    await page.keyboard.press('ArrowLeft');
    await expect(drawer).toHaveAttribute('data-active-family', 'battlefield');
    await expect(page.getByTestId('landscape-ticker-category-blitz')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.getByTestId('expanded-ticker-close').click();
    await page.getByTestId('rating-ticker-expand-mobile').click();
    await expect(page.getByTestId('expanded-rating-ticker-drawer')).toHaveAttribute(
      'data-active-family',
      'free',
    );
    await expect(page.getByTestId('expanded-rating-ticker-drawer')).toHaveAttribute(
      'data-selected-count',
      '0',
    );
    await expect(page.getByTestId('landscape-ticker-empty-plot')).toBeVisible();
  });

  test('reduced motion disables family screen transition', async ({ page }) => {
    await mountLandscapeTicker(page, {
      viewport: { width: 800, height: 360 },
      reducedMotion: true,
    });
    const drawer = page.getByTestId('expanded-rating-ticker-drawer');
    await expect(drawer).toHaveAttribute('data-family-transition', 'none');
    await expect(page.getByTestId('landscape-ticker-family-track')).toHaveAttribute(
      'data-reduced-motion',
      'true',
    );
    await page.getByTestId('landscape-ticker-family-kptv').click();
    await expect(drawer).toHaveAttribute('data-active-family', 'kptv');
    await expect(page.getByTestId('landscape-ticker-family-unavailable-kptv')).toBeVisible();
  });

  test('inactive family panels expose native inert and exclude hidden Free controls', async ({
    page,
  }) => {
    await mountLandscapeTicker(page, { viewport: { width: 800, height: 360 } });
    const drawer = page.getByTestId('expanded-rating-ticker-drawer');
    const freePanel = page.getByTestId('landscape-ticker-family-panel-free');

    await page.getByTestId('landscape-ticker-family-battlefield').click();
    await expect(drawer).toHaveAttribute('data-active-family', 'battlefield');
    expect(await freePanel.evaluate((el) => el.hasAttribute('inert'))).toBe(true);
    expect(await freePanel.evaluate((el) => (el as HTMLElement).inert)).toBe(true);
    await expect(freePanel).toHaveAttribute('aria-hidden', 'true');
    expect(
      await page.getByTestId('landscape-ticker-family-panel-battlefield').evaluate((el) => ({
        attr: el.hasAttribute('inert'),
        prop: (el as HTMLElement).inert,
      })),
    ).toEqual({ attr: false, prop: false });

    const hiddenFocus = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="landscape-ticker-category-blitz"]');
      if (!(el instanceof HTMLElement)) return 'missing';
      el.focus();
      return document.activeElement === el ? 'focused' : 'blocked';
    });
    expect(hiddenFocus).toBe('blocked');

    await page.getByTestId('landscape-ticker-family-battlefield').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByTestId('expanded-ticker-close')).toBeFocused();

    const clickHidden = await page
      .getByTestId('landscape-ticker-category-blitz')
      .click({ timeout: 800 })
      .then(() => 'clicked')
      .catch(() => 'blocked');
    expect(clickHidden).toBe('blocked');
    await expect(drawer).toHaveAttribute('data-selected-count', '0');
    await expect(drawer).toHaveAttribute('data-active-reveal', 'none');

    await page.getByTestId('landscape-ticker-family-kptv').click();
    expect(await freePanel.evaluate((el) => el.hasAttribute('inert') && (el as HTMLElement).inert)).toBe(
      true,
    );
    await expect(page.getByTestId('landscape-ticker-family-panel-kptv')).not.toHaveAttribute('inert');
    await page.getByTestId('landscape-ticker-family-kptv').focus();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByTestId('expanded-ticker-close')).toBeFocused();

    await page.getByTestId('landscape-ticker-family-free').click();
    expect(await freePanel.evaluate((el) => el.hasAttribute('inert') || (el as HTMLElement).inert)).toBe(
      false,
    );
    await expect(freePanel).toHaveAttribute('aria-hidden', 'false');
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await expect(page.getByTestId('landscape-ticker-category-blitz')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('event row renders an arrow and middle-dot without mojibake', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.clock.fastForward(1800);
    const delta = page.getByTestId('landscape-ticker-event-delta').first();
    await expect(delta).toBeAttached();
    const deltaText = await delta.evaluate((el) => el.textContent ?? '');
    expect(deltaText).toContain('1511');
    expect(deltaText).toContain('\u2192');
    expect(deltaText).toContain('1528');
    expect(deltaText).not.toContain('\u00E2');
    expect(deltaText).not.toContain('â');
    const meta = await page.getByTestId('landscape-ticker-event-meta').first().evaluate((el) => el.textContent ?? '');
    expect(meta).toContain('\u00B7');
    expect(meta).not.toContain('Â');
    expect(meta).not.toContain('â');
  });

  test('close/reopen first paint is empty Free with no stale family or reveal', async ({ page }) => {
    await mountLandscapeTicker(page, { viewport: { width: 800, height: 360 } });
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.getByTestId('landscape-ticker-family-kptv').click();
    await expect(page.getByTestId('expanded-rating-ticker-drawer')).toHaveAttribute(
      'data-active-family',
      'kptv',
    );
    await page.getByTestId('expanded-ticker-close').click();
    await expect(page.getByTestId('expanded-rating-ticker-drawer')).toHaveCount(0);
    await page.getByTestId('rating-ticker-expand-mobile').click();
    const first = await page.getByTestId('expanded-rating-ticker-drawer').evaluate((el) => ({
      family: el.getAttribute('data-active-family'),
      selected: el.getAttribute('data-selected-count'),
      reveal: el.getAttribute('data-active-reveal'),
    }));
    expect(first).toEqual({ family: 'free', selected: '0', reveal: 'none' });
    await expect(page.getByTestId('landscape-ticker-empty-plot')).toBeVisible();
  });

  test('short landscape keeps chrome, graph frame, labels, and point detail unclipped', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    for (const viewport of [
      { width: 800, height: 360 },
      { width: 667, height: 375 },
    ]) {
      await mountLandscapeTicker(page, { viewport });
      await page.clock.fastForward(50);
      const vw = viewport.width;
      const vh = viewport.height;
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);

      const closeRect = await page.getByTestId('expanded-ticker-close').boundingBox();
      expect(closeRect).toBeTruthy();
      expect(fullyInViewport(toBox(closeRect!), vw, vh)).toBe(true);
      for (const id of [
        'landscape-ticker-family-free',
        'landscape-ticker-family-battlefield',
        'landscape-ticker-family-kptv',
      ]) {
        const rect = await page.getByTestId(id).boundingBox();
        expect(rect).toBeTruthy();
        expect(fullyInViewport(toBox(rect!), vw, vh)).toBe(true);
      }

      await page.getByTestId('landscape-ticker-category-blitz').click();
      await page.clock.fastForward(1800);
      await page.getByTestId('landscape-ticker-chart-focus').focus();
      await page.keyboard.press('ArrowRight');
      const chart = page.getByTestId('landscape-ticker-chart');
      await chart.evaluate((el) => el.scrollIntoView({ block: 'nearest' }));
      const scroll = page.getByTestId('landscape-ticker-body-scroll');
      const chartBox = toBox((await chart.boundingBox())!);
      const scrollBox = toBox((await scroll.boundingBox())!);
      expect(notClippedBy(chartBox, scrollBox, 2)).toBe(true);
      expect(fullyInViewport(chartBox, vw, vh, 2)).toBe(true);

      const minLabel = page.getByTestId('landscape-ticker-scale-min');
      await expect(minLabel).toBeAttached();
      const minBox = toBox((await minLabel.boundingBox())!);
      expect(notClippedBy(minBox, chartBox, 2)).toBe(true);

      const marker = page.locator('[id^="landscape-ticker-marker-"]').first();
      const markerBox = toBox((await marker.boundingBox())!);
      expect(notClippedBy(markerBox, chartBox, 4)).toBe(true);

      const detail = page.getByTestId('landscape-ticker-point-detail');
      await detail.evaluate((el) => el.scrollIntoView({ block: 'nearest' }));
      const detailBox = toBox((await detail.boundingBox())!);
      expect(detailBox.height).toBeGreaterThan(0);
      expect(detailBox.top < vh && detailBox.bottom > 0).toBe(true);
      await expect(page.getByTestId('landscape-ticker-finished-link')).toBeVisible();
    }
  });

  test('activation dominance stacks series, pointer, keyboard, family, and reset', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);
    const drawer = page.getByTestId('expanded-rating-ticker-drawer');
    const chart = page.getByTestId('landscape-ticker-chart');

    const buttonOrder = await page
      .getByTestId('landscape-ticker-category-controls')
      .locator('button')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-testid')));
    expect(buttonOrder).toEqual([
      'landscape-ticker-category-accl',
      'landscape-ticker-category-tournament',
      'landscape-ticker-category-bullet',
      'landscape-ticker-category-blitz',
      'landscape-ticker-category-rapid',
      'landscape-ticker-category-daily',
    ]);

    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.clock.fastForward(50);
    await expect(drawer).toHaveAttribute('data-dominance-order', 'free_blitz');
    await expect(chart).toHaveAttribute('data-dominant-category', 'free_blitz');
    const scaleMax = (await page.getByTestId('landscape-ticker-scale-max').textContent()) ?? '';
    const scaleMin = (await page.getByTestId('landscape-ticker-scale-min').textContent()) ?? '';

    await page.getByTestId('landscape-ticker-category-rapid').click();
    await page.getByTestId('landscape-ticker-category-daily').click();
    await expect(page.getByTestId('landscape-ticker-path-free_rapid')).toHaveCount(0);
    await expect(drawer).toHaveAttribute('data-dominance-order', 'free_blitz');
    await page.clock.fastForward(1800);
    await page.clock.fastForward(1800);
    await expect(drawer).toHaveAttribute(
      'data-dominance-order',
      'free_blitz free_rapid free_day',
    );
    await expect(chart).toHaveAttribute('data-dominant-category', 'free_day');
    const stack = await page.locator('[data-testid^="landscape-ticker-path-"]').evaluateAll((nodes) =>
      nodes.map((n) => ({
        id: (n.getAttribute('data-testid') ?? '').replace('landscape-ticker-path-', ''),
        dominant: n.getAttribute('data-dominant'),
        phase: n.getAttribute('data-reveal-phase'),
      })),
    );
    expect(stack.map((s) => s.id)).toEqual(['free_blitz', 'free_rapid', 'free_day']);
    expect(stack[2]).toMatchObject({ id: 'free_day', dominant: 'true' });
    expect(stack[0].dominant).toBe('false');
    const laterMax = (await page.getByTestId('landscape-ticker-scale-max').textContent()) ?? '';
    const laterMin = (await page.getByTestId('landscape-ticker-scale-min').textContent()) ?? '';
    expect(Number(scaleMax)).toBeGreaterThan(Number(scaleMin));
    expect(Number(laterMax)).toBeGreaterThan(Number(laterMin));
    expect(Number(laterMax)).toBeGreaterThanOrEqual(1528);

    await page.getByTestId('landscape-ticker-category-daily').click();
    await expect(drawer).toHaveAttribute('data-dominance-order', 'free_blitz free_rapid');
    await expect(chart).toHaveAttribute('data-dominant-category', 'free_rapid');
    await page.getByTestId('landscape-ticker-category-rapid').click();
    await expect(drawer).toHaveAttribute('data-dominance-order', 'free_blitz');
    await expect(chart).toHaveAttribute('data-dominant-category', 'free_blitz');

    await page.getByTestId('landscape-ticker-category-rapid').click();
    await page.clock.fastForward(1800);
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await expect(page.getByTestId('landscape-ticker-path-free_blitz')).toHaveAttribute(
      'data-reveal-phase',
      'quiet',
    );
    await expect(drawer).toHaveAttribute('data-dominance-order', 'free_rapid free_blitz');
    await expect(chart).toHaveAttribute('data-dominant-category', 'free_blitz');

    await page.getByTestId('landscape-ticker-marker-free_blitz-bz-3').click();
    await expect(page.getByTestId('landscape-ticker-point-detail')).toContainText('Blitz');

    await page.getByTestId('landscape-ticker-chart-focus').focus();
    await page.keyboard.press('Home');
    await expect(page.getByTestId('landscape-ticker-point-detail')).toContainText('Blitz');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('landscape-ticker-point-detail')).toBeVisible();

    await page.getByTestId('landscape-ticker-family-battlefield').click();
    await page.getByTestId('landscape-ticker-family-kptv').click();
    await page.getByTestId('landscape-ticker-family-free').click();
    await expect(drawer).toHaveAttribute('data-dominance-order', 'free_rapid free_blitz');
    await expect(chart).toHaveAttribute('data-dominant-category', 'free_blitz');

    await page.getByTestId('rating-lane-tab-week').click();
    await expect(drawer).toHaveAttribute('data-dominance-order', 'free_rapid free_blitz');
    await page.getByTestId('rating-lane-tab-overall').click();

    await page.getByTestId('expanded-ticker-close').click();
    await page.getByTestId('rating-ticker-expand-mobile').click();
    await expect(drawer).toHaveAttribute('data-dominance-order', 'none');
    await expect(drawer).toHaveAttribute('data-selected-count', '0');
    await expect(chart).toHaveAttribute('data-dominant-category', 'none');
  });

  test('drawer source is UTF-8 without BOM and still renders arrow and middle-dot', async ({
    page,
  }) => {
    const drawerPath = join(process.cwd(), 'components/profile/ratings/ExpandedRatingTickerDrawer.tsx');
    const bytes = readFileSync(drawerPath);
    expect(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf).toBe(false);
    const production = [
      'components/profile/ratings/ExpandedRatingTickerDrawer.tsx',
      'components/profile/ratings/LandscapeRatingTickerChart.tsx',
      'components/profile/ratings/LandscapeTickerFamilyPager.tsx',
      'components/profile/ratings/landscapeRatingTicker.module.css',
      'lib/profile/landscapeTickerCategories.ts',
      'lib/profile/landscapeTickerDialogChrome.ts',
      'lib/profile/landscapeTickerFamilies.ts',
      'lib/profile/landscapeTickerMotion.ts',
      'lib/profile/landscapeTickerPath.ts',
      'lib/profile/landscapeTickerSession.ts',
      'lib/profile/landscapeTickerViewport.ts',
    ];
    for (const rel of production) {
      const buf = readFileSync(join(process.cwd(), rel));
      expect(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf).toBe(false);
    }
    const text = bytes.toString('utf8');
    expect(text.codePointAt(0)).not.toBe(0xfeff);
    expect(text.startsWith('\uFEFF')).toBe(false);
    expect(text).toContain("const RATING_ARROW = '\\u2192'");
    expect(text).toContain("const META_DOT = '\\u00B7'");
    expect(text).not.toContain('\u00E2');
    expect(text).not.toContain('\u00C2');
    expect(text).not.toContain('\uFFFD');

    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.clock.fastForward(1800);
    const hiddenDelta = await page
      .getByTestId('landscape-ticker-event-delta')
      .first()
      .evaluate((el) => el.textContent ?? '');
    expect(hiddenDelta).toContain('1511 \u2192 1528 (+17)');
    const hiddenMeta = await page
      .getByTestId('landscape-ticker-event-meta')
      .first()
      .evaluate((el) => el.textContent ?? '');
    expect(hiddenMeta).toContain('\u00B7');
    expect(hiddenMeta).not.toContain('â');
    expect(hiddenMeta).not.toContain('Â');

    await page.setViewportSize({ width: 360, height: 800 });
    await page.clock.fastForward(50);
    await expect(page.getByTestId('landscape-ticker-event-delta').first()).toHaveText(
      '1511 \u2192 1528 (+17)',
    );
    const meta = await page.getByTestId('landscape-ticker-event-meta').first().innerText();
    expect(meta).toContain('\u00B7');
    expect(meta).not.toContain('â');
    expect(meta).not.toContain('Â');
  });

  test('intersecting fixture paths transfer pointer ownership at a real crossing', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { crossing: true, viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);
    await expect(page.getByTestId('landscape-ticker-harness')).toHaveAttribute(
      'data-fixture',
      'crossing',
    );
    const drawer = page.getByTestId('expanded-rating-ticker-drawer');
    const chart = page.getByTestId('landscape-ticker-chart');

    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.clock.fastForward(50);
    await expect(drawer).toHaveAttribute('data-dominance-order', 'free_blitz');
    const blitzOnly = await ownerAtSeriesCrossing(page, 'free_blitz', BLITZ_RAPID_CROSS_U);
    expect(blitzOnly.owner).toBe('landscape-ticker-path-free_blitz');
    expect(blitzOnly.dominant).toBe('true');
    expect(blitzOnly.rapidCount).toBe(0);

    await page.getByTestId('landscape-ticker-category-rapid').click();
    await expect(page.getByTestId('landscape-ticker-path-free_rapid')).toHaveCount(0);
    const queued = await ownerAtSeriesCrossing(page, 'free_blitz', BLITZ_RAPID_CROSS_U);
    expect(queued.owner).toBe('landscape-ticker-path-free_blitz');
    expect(queued.rapidCount).toBe(0);
    await expect(drawer).toHaveAttribute('data-dominance-order', 'free_blitz');

    await page.clock.fastForward(1800);
    await expect(chart).toHaveAttribute('data-dominant-category', 'free_rapid');
    const stackRapid = await page.locator('[data-testid^="landscape-ticker-path-"]').evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute('data-testid')),
    );
    expect(stackRapid).toEqual([
      'landscape-ticker-path-free_blitz',
      'landscape-ticker-path-free_rapid',
    ]);
    const rapidFront = await ownerAtSeriesCrossing(page, 'free_blitz', BLITZ_RAPID_CROSS_U);
    expect(rapidFront.owner).toBe('landscape-ticker-path-free_rapid');
    expect(rapidFront.dominant).toBe('true');

    await page.getByTestId('landscape-ticker-category-daily').click();
    await page.clock.fastForward(1800);
    await expect(chart).toHaveAttribute('data-dominant-category', 'free_day');
    const stackDaily = await page.locator('[data-testid^="landscape-ticker-path-"]').evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute('data-testid')),
    );
    expect(stackDaily).toEqual([
      'landscape-ticker-path-free_blitz',
      'landscape-ticker-path-free_rapid',
      'landscape-ticker-path-free_day',
    ]);
    const dailyFront = await ownerAtSeriesCrossing(page, 'free_day', DAILY_RAPID_FIRST_CROSS_U);
    expect(dailyFront.owner).toBe('landscape-ticker-path-free_day');
    expect(dailyFront.dominant).toBe('true');

    await page.getByTestId('landscape-ticker-chart-focus').focus();
    await page.keyboard.press('Home');
    await expect(page.getByTestId('landscape-ticker-point-detail')).toContainText('Daily');

    await page.getByTestId('landscape-ticker-category-daily').click();
    await expect(chart).toHaveAttribute('data-dominant-category', 'free_rapid');
    const rapidAgain = await ownerAtSeriesCrossing(page, 'free_blitz', BLITZ_RAPID_CROSS_U);
    expect(rapidAgain.owner).toBe('landscape-ticker-path-free_rapid');

    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await expect(page.getByTestId('landscape-ticker-path-free_blitz')).toHaveAttribute(
      'data-reveal-phase',
      'quiet',
    );
    await expect(chart).toHaveAttribute('data-dominant-category', 'free_blitz');
    const blitzQuiet = await ownerAtSeriesCrossing(page, 'free_blitz', BLITZ_RAPID_CROSS_U);
    expect(blitzQuiet.owner).toBe('landscape-ticker-path-free_blitz');
    expect(blitzQuiet.dominant).toBe('true');

    await page.getByTestId('landscape-ticker-chart-focus').focus();
    await page.keyboard.press('Home');
    await expect(page.getByTestId('landscape-ticker-point-detail')).toContainText('Blitz');
  });

  test('reduced-motion dominance updates without a queued hero', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mountLandscapeTicker(page, { viewport: { width: 800, height: 360 } });
    const drawer = page.getByTestId('expanded-rating-ticker-drawer');
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.getByTestId('landscape-ticker-category-rapid').click();
    await page.getByTestId('landscape-ticker-category-daily').click();
    await expect(drawer).toHaveAttribute(
      'data-dominance-order',
      'free_blitz free_rapid free_day',
    );
    await expect(page.getByTestId('landscape-ticker-chart')).toHaveAttribute(
      'data-dominant-category',
      'free_day',
    );
    const stack = await page.locator('[data-testid^="landscape-ticker-path-"]').evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute('data-testid')),
    );
    expect(stack).toEqual([
      'landscape-ticker-path-free_blitz',
      'landscape-ticker-path-free_rapid',
      'landscape-ticker-path-free_day',
    ]);
  });
});

test.describe('landscape ticker actual-component visual evidence', () => {
  test('capture empty, hero, settled, two-line, narrow, keyboard, and reduced-motion states', async ({
    page,
  }, testInfo) => {
    const captureDir = landscapeTickerCaptureDir(testInfo);
    if (!captureDir) {
      test.skip(true, 'Set LANDSCAPE_TICKER_CAPTURE_DIR to write opt-in screenshots (path, or 1 / playwright-output).');
      return;
    }
    mkdirSync(captureDir, { recursive: true });
    const shot = (name: string) => join(captureDir, name);

    await mountLandscapeTicker(page, {
      empty: true,
      viewport: { width: 360, height: 800 },
    });
    await page.screenshot({ path: shot('01-empty-portrait.png'), fullPage: true });

    await page.setViewportSize({ width: 800, height: 360 });
    await page.screenshot({ path: shot('02-empty-landscape.png'), fullPage: true });

    await page.evaluate(() => {
      (
        window as Window & { __tickerHarness?: { setEmpty: (v: boolean) => void } }
      ).__tickerHarness?.setEmpty(false);
    });
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.screenshot({ path: shot('03-hero-in-progress.png'), fullPage: true });
    await page.waitForTimeout(1900);
    await page.screenshot({ path: shot('04-hero-settled-point-list.png'), fullPage: true });

    await page.getByTestId('landscape-ticker-category-rapid').click();
    await page.waitForTimeout(1900);
    await page.getByTestId('landscape-ticker-chart-focus').focus();
    await page.keyboard.press('ArrowRight');
    await page.screenshot({ path: shot('05-two-selected-lines.png'), fullPage: true });

    await page.setViewportSize({ width: 667, height: 375 });
    await page.waitForTimeout(50);
    await page.screenshot({ path: shot('06-narrow-landscape-controls.png'), fullPage: true });
    await page.getByTestId('expanded-ticker-close').focus();
    await page.screenshot({ path: shot('07-focus-keyboard.png'), fullPage: true });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByTestId('expanded-ticker-close').click();
    await page.getByTestId('rating-ticker-expand-mobile').click();
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.getByTestId('landscape-ticker-category-rapid').click();
    await page.screenshot({ path: shot('08-reduced-motion-settled.png'), fullPage: true });

    await page.getByTestId('expanded-ticker-close').click();
    await page.getByTestId('rating-ticker-expand-mobile').click();
    await page.setViewportSize({ width: 800, height: 360 });
    await page.screenshot({ path: shot('09-family-free-active.png'), fullPage: true });
    await page.getByTestId('landscape-ticker-family-battlefield').click();
    await page.screenshot({ path: shot('10-family-battlefield-active.png'), fullPage: true });
    await page.getByTestId('landscape-ticker-family-kptv').click();
    await page.screenshot({ path: shot('11-family-kptv-active.png'), fullPage: true });
    await page.getByTestId('landscape-ticker-family-free').click();
    await page.setViewportSize({ width: 360, height: 800 });
    await page.screenshot({ path: shot('12-family-dots-portrait-360x800.png'), fullPage: true });
    await page.setViewportSize({ width: 800, height: 360 });
    await page.screenshot({ path: shot('13-family-dots-landscape-800x360.png'), fullPage: true });
    await page.setViewportSize({ width: 667, height: 375 });
    await page.screenshot({ path: shot('14-family-dots-narrow-667x375.png'), fullPage: true });

    await page.setViewportSize({ width: 800, height: 360 });
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.waitForTimeout(1900);
    await page.getByTestId('landscape-ticker-chart-focus').focus();
    await page.keyboard.press('ArrowRight');
    await page.getByTestId('landscape-ticker-point-detail').evaluate((el) =>
      el.scrollIntoView({ block: 'nearest' }),
    );
    await page.screenshot({ path: shot('15-point-detail-800x360.png'), fullPage: true });
    await page.setViewportSize({ width: 667, height: 375 });
    await page.waitForTimeout(50);
    await page.getByTestId('landscape-ticker-point-detail').evaluate((el) =>
      el.scrollIntoView({ block: 'nearest' }),
    );
    await page.screenshot({ path: shot('16-point-detail-667x375.png'), fullPage: true });
    await page.getByTestId('landscape-ticker-family-battlefield').click();
    await page.getByTestId('landscape-ticker-family-free').click();
    await page.screenshot({ path: shot('17-return-free-selection-preserved.png'), fullPage: true });
    await page.getByTestId('expanded-ticker-close').click();
    await page.getByTestId('rating-ticker-expand-mobile').click();
    await page.screenshot({ path: shot('18-reopen-empty-free.png'), fullPage: true });

    const cssSource = await page.locator('html').getAttribute('data-harness-css');
    writeFileSync(join(captureDir, 'harness-css-source.txt'), `${cssSource ?? 'unknown'}\n`, 'utf8');
  });
});

test.describe('landscape ticker crossing dominance visual evidence', () => {
  test('capture real intersecting-path dominance at 800x360 and 667x375', async ({
    page,
  }, testInfo) => {
    const captureDir = landscapeTickerCaptureDir(testInfo);
    if (!captureDir) {
      test.skip(true, 'Set LANDSCAPE_TICKER_CAPTURE_DIR to write opt-in screenshots (path, or 1 / playwright-output).');
      return;
    }
    mkdirSync(captureDir, { recursive: true });
    const shot = (name: string) => join(captureDir, name);

    await mountLandscapeTicker(page, {
      crossing: true,
      viewport: { width: 800, height: 360 },
    });
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.waitForTimeout(1900);
    await page.screenshot({ path: shot('x01-blitz-front-800x360.png'), fullPage: true });

    await page.getByTestId('landscape-ticker-category-rapid').click();
    await page.waitForTimeout(1900);
    await page.screenshot({ path: shot('x02-rapid-crosses-blitz-800x360.png'), fullPage: true });

    await page.getByTestId('landscape-ticker-category-daily').click();
    await page.waitForTimeout(1900);
    await page.screenshot({ path: shot('x03-daily-crosses-both-800x360.png'), fullPage: true });

    await page.getByTestId('landscape-ticker-category-daily').click();
    await page.screenshot({ path: shot('x04-daily-removed-rapid-front-800x360.png'), fullPage: true });

    await page.getByTestId('landscape-ticker-category-rapid').click();
    await page.screenshot({ path: shot('x05-rapid-removed-blitz-800x360.png'), fullPage: true });

    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.waitForTimeout(1900);
    await page.screenshot({ path: shot('x06-blitz-reselected-front-800x360.png'), fullPage: true });

    await page.getByTestId('expanded-ticker-close').click();
    await page.getByTestId('rating-ticker-expand-mobile').click();
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.getByTestId('landscape-ticker-category-rapid').click();
    await page.getByTestId('landscape-ticker-category-daily').click();
    await page.screenshot({ path: shot('x07-queued-rapid-not-dominant-800x360.png'), fullPage: true });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByTestId('expanded-ticker-close').click();
    await page.getByTestId('rating-ticker-expand-mobile').click();
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.getByTestId('landscape-ticker-category-rapid').click();
    await page.getByTestId('landscape-ticker-category-daily').click();
    await page.screenshot({ path: shot('x08-reduced-motion-daily-front-800x360.png'), fullPage: true });

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByTestId('expanded-ticker-close').click();
    await page.getByTestId('rating-ticker-expand-mobile').click();
    await page.setViewportSize({ width: 667, height: 375 });
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.waitForTimeout(1900);
    await page.getByTestId('landscape-ticker-category-rapid').click();
    await page.waitForTimeout(1900);
    await page.screenshot({ path: shot('x09-rapid-crosses-blitz-667x375.png'), fullPage: true });
    await page.getByTestId('landscape-ticker-category-daily').click();
    await page.waitForTimeout(1900);
    await page.screenshot({ path: shot('x10-daily-crosses-both-667x375.png'), fullPage: true });
    await page.getByTestId('landscape-ticker-category-daily').click();
    await page.screenshot({ path: shot('x11-daily-removed-rapid-front-667x375.png'), fullPage: true });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByTestId('expanded-ticker-close').click();
    await page.getByTestId('rating-ticker-expand-mobile').click();
    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.getByTestId('landscape-ticker-category-rapid').click();
    await page.getByTestId('landscape-ticker-category-daily').click();
    await page.screenshot({ path: shot('x12-reduced-motion-daily-front-667x375.png'), fullPage: true });

    writeFileSync(join(captureDir, 'crossing-fixture.txt'), 'crossing\n', 'utf8');

    expect(true).toBe(true);
  });
});
