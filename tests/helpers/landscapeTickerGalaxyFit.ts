import { expect, type Page } from '@playwright/test';

import { isLandscapeFitBox } from '../../lib/profile/landscapeTickerViewport';

export const FREE_CATEGORY_IDS = [
  'landscape-ticker-category-accl',
  'landscape-ticker-category-tournament',
  'landscape-ticker-category-bullet',
  'landscape-ticker-category-blitz',
  'landscape-ticker-category-rapid',
  'landscape-ticker-category-daily',
] as const;

export const TIME_CONTROL_IDS = [
  'rating-lane-tab-day',
  'rating-lane-tab-week',
  'rating-lane-tab-month',
  'rating-lane-tab-year',
  'rating-lane-tab-overall',
] as const;

export const FAMILY_IDS = [
  'landscape-ticker-family-free',
  'landscape-ticker-family-battlefield',
  'landscape-ticker-family-kptv',
] as const;

export const EXPAND_VISIBLE_VIEWPORTS = [
  { width: 360, height: 800, label: '360x800' },
  { width: 667, height: 375, label: '667x375' },
  { width: 800, height: 360, label: '800x360' },
  { width: 883, height: 412, label: 'galaxy-landscape-883x412' },
  { width: 800, height: 330, label: 'reduced-chrome-800x330' },
  { width: 883, height: 372, label: 'reduced-chrome-883x372' },
] as const;

export const EXPAND_HIDDEN_VIEWPORTS = [
  { width: 1280, height: 720, label: '1280x720' },
  { width: 1920, height: 1080, label: '1920x1080' },
] as const;

export const FITTED_LANDSCAPE_VIEWPORTS = [
  { width: 667, height: 375, label: '667x375' },
  { width: 800, height: 360, label: '800x360' },
  { width: 883, height: 412, label: 'galaxy-landscape-883x412' },
  { width: 800, height: 330, label: 'reduced-chrome-800x330' },
  { width: 883, height: 372, label: 'reduced-chrome-883x372' },
] as const;

/** Playwright fake clocks must pass the last settlement delay. */
export const VIEWPORT_SETTLE_FAST_FORWARD_MS = 500;

export type GalaxyFitMeasurement = {
  simulatedReducedViewport: true;
  physicalSamsungBrowser: false;
  innerWidth: number;
  innerHeight: number;
  visualViewport: {
    width: number | null;
    height: number | null;
    offsetTop: number | null;
    offsetLeft: number | null;
  };
  devicePixelRatio: number;
  overlay: { top: number; left: number; right: number; bottom: number; width: number; height: number };
  chart: { top: number; left: number; right: number; bottom: number; width: number; height: number };
  document: { scrollWidth: number; scrollHeight: number; clientWidth: number; clientHeight: number };
  body: { scrollWidth: number; scrollHeight: number; clientWidth: number; clientHeight: number };
  bodyScroll: {
    scrollWidth: number;
    scrollHeight: number;
    clientWidth: number;
    clientHeight: number;
    overflowX: string;
    overflowY: string;
    overscrollBehavior: string;
  };
  categoryControls: {
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
    scrollWidth: number;
    scrollHeight: number;
    clientWidth: number;
    clientHeight: number;
  };
  landscapeFit: string | null;
  overlayOverscroll: string;
  htmlOverflow: string;
  bodyOverflow: string;
  htmlOverscroll: string;
  bodyOverscroll: string;
  scrollLock: string | undefined;
};

export async function settleVisualViewport(page: Page): Promise<void> {
  await page.clock.fastForward(VIEWPORT_SETTLE_FAST_FORWARD_MS);
}

export async function measureGalaxyFit(page: Page): Promise<GalaxyFitMeasurement> {
  return page.evaluate(() => {
    const rectOf = (el: Element | null) => {
      const r = el?.getBoundingClientRect();
      return {
        top: r?.top ?? 0,
        left: r?.left ?? 0,
        right: r?.right ?? 0,
        bottom: r?.bottom ?? 0,
        width: r?.width ?? 0,
        height: r?.height ?? 0,
      };
    };
    const overlay = document.querySelector('[data-testid="expanded-rating-ticker-drawer"]');
    const chart = document.querySelector('[data-testid="landscape-ticker-chart"]');
    const cats = document.querySelector('[data-testid="landscape-ticker-category-controls"]');
    const bodyScroll = document.querySelector('[data-testid="landscape-ticker-body-scroll"]');
    const vv = window.visualViewport;
    const bodyScrollEl = bodyScroll as HTMLElement | null;
    const catsEl = cats as HTMLElement | null;
    const overlayCs = overlay ? getComputedStyle(overlay) : null;
    const bodyScrollCs = bodyScrollEl ? getComputedStyle(bodyScrollEl) : null;
    return {
      simulatedReducedViewport: true as const,
      physicalSamsungBrowser: false as const,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      visualViewport: {
        width: vv?.width ?? null,
        height: vv?.height ?? null,
        offsetTop: vv?.offsetTop ?? null,
        offsetLeft: vv?.offsetLeft ?? null,
      },
      devicePixelRatio: window.devicePixelRatio,
      overlay: rectOf(overlay),
      chart: rectOf(chart),
      document: {
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        clientWidth: document.documentElement.clientWidth,
        clientHeight: document.documentElement.clientHeight,
      },
      body: {
        scrollWidth: document.body.scrollWidth,
        scrollHeight: document.body.scrollHeight,
        clientWidth: document.body.clientWidth,
        clientHeight: document.body.clientHeight,
      },
      bodyScroll: {
        scrollWidth: bodyScrollEl?.scrollWidth ?? 0,
        scrollHeight: bodyScrollEl?.scrollHeight ?? 0,
        clientWidth: bodyScrollEl?.clientWidth ?? 0,
        clientHeight: bodyScrollEl?.clientHeight ?? 0,
        overflowX: bodyScrollCs?.overflowX ?? '',
        overflowY: bodyScrollCs?.overflowY ?? '',
        overscrollBehavior: bodyScrollCs?.overscrollBehavior ?? '',
      },
      categoryControls: {
        ...rectOf(cats),
        scrollWidth: catsEl?.scrollWidth ?? 0,
        scrollHeight: catsEl?.scrollHeight ?? 0,
        clientWidth: catsEl?.clientWidth ?? 0,
        clientHeight: catsEl?.clientHeight ?? 0,
      },
      landscapeFit: overlay?.getAttribute('data-landscape-fit') ?? null,
      overlayOverscroll: overlayCs?.overscrollBehavior ?? '',
      htmlOverflow: document.documentElement.style.overflow,
      bodyOverflow: document.body.style.overflow,
      htmlOverscroll: document.documentElement.style.overscrollBehavior,
      bodyOverscroll: document.body.style.overscrollBehavior,
      scrollLock: document.body.dataset.landscapeTickerScrollLock,
    };
  });
}

export function assertOverlayMatchesVisualViewport(m: GalaxyFitMeasurement, slop = 1): void {
  const vvW = m.visualViewport.width ?? m.innerWidth;
  const vvH = m.visualViewport.height ?? m.innerHeight;
  const top = m.visualViewport.offsetTop ?? 0;
  const left = m.visualViewport.offsetLeft ?? 0;
  expect(Math.abs(m.overlay.top - top), `overlay.top vs vv.offsetTop ${JSON.stringify(m)}`).toBeLessThanOrEqual(slop);
  expect(Math.abs(m.overlay.left - left), `overlay.left vs vv.offsetLeft ${JSON.stringify(m)}`).toBeLessThanOrEqual(slop);
  expect(Math.abs(m.overlay.width - vvW), `overlay.width vs vv.width ${JSON.stringify(m)}`).toBeLessThanOrEqual(slop);
  expect(Math.abs(m.overlay.height - vvH), `overlay.height vs vv.height ${JSON.stringify(m)}`).toBeLessThanOrEqual(slop);
  expect(
    Math.abs(m.overlay.right - (left + vvW)),
    `overlay.right vs vv right edge ${JSON.stringify(m)}`,
  ).toBeLessThanOrEqual(slop);
  expect(
    Math.abs(m.overlay.bottom - (top + vvH)),
    `overlay.bottom vs vv bottom edge ${JSON.stringify(m)}`,
  ).toBeLessThanOrEqual(slop);
}

export function assertLandscapeFitFollowsMeasurement(m: GalaxyFitMeasurement): void {
  const expected = isLandscapeFitBox({
    width: Math.round(m.visualViewport.width ?? m.innerWidth),
    height: Math.round(m.visualViewport.height ?? m.innerHeight),
  });
  expect(m.landscapeFit).toBe(expected ? 'true' : 'false');
}

export function assertNoScrollFittedLandscape(m: GalaxyFitMeasurement): void {
  expect(m.simulatedReducedViewport).toBe(true);
  expect(m.physicalSamsungBrowser).toBe(false);
  expect(m.bodyScroll.scrollHeight).toBeLessThanOrEqual(m.bodyScroll.clientHeight + 1);
  expect(m.bodyScroll.scrollWidth).toBeLessThanOrEqual(m.bodyScroll.clientWidth + 1);
  expect(m.document.scrollHeight).toBeLessThanOrEqual(Math.max(m.document.clientHeight, m.innerHeight) + 1);
  expect(m.document.scrollWidth).toBeLessThanOrEqual(Math.max(m.document.clientWidth, m.innerWidth) + 1);
  expect(m.body.scrollHeight).toBeLessThanOrEqual(m.body.clientHeight + 1);
  expect(m.body.scrollWidth).toBeLessThanOrEqual(m.body.clientWidth + 1);
  expect(m.categoryControls.scrollWidth).toBeLessThanOrEqual(m.categoryControls.clientWidth + 1);
  expect(m.categoryControls.scrollHeight).toBeLessThanOrEqual(m.categoryControls.clientHeight + 1);
  expect(m.bodyOverflow).toBe('hidden');
  expect(m.htmlOverflow).toBe('hidden');
  expect(m.scrollLock).toBe('true');
  expect(m.overlayOverscroll).toMatch(/none|contain/);
  expect(m.bodyOverscroll).toMatch(/none|contain/);
  expect(m.htmlOverscroll).toMatch(/none|contain/);
  expect(m.bodyScroll.overscrollBehavior).toMatch(/none|contain/);
  expect(m.bodyScroll.overflowY).toMatch(/hidden|clip/);
  expect(m.chart.width).toBeGreaterThan(8);
  expect(m.chart.height).toBeGreaterThan(8);
}

export async function assertEssentialControlsUnclipped(page: Page): Promise<void> {
  const ids = [
    ...FAMILY_IDS,
    ...FREE_CATEGORY_IDS,
    ...TIME_CONTROL_IDS,
    'landscape-ticker-chart',
    'expanded-ticker-close',
  ];
  const report = await page.evaluate((testIds) => {
    const overlay = document.querySelector('[data-testid="expanded-rating-ticker-drawer"]');
    const cats = document.querySelector('[data-testid="landscape-ticker-category-controls"]');
    if (!overlay) return { missing: testIds, clipped: testIds, categoryClipped: testIds };
    const outer = overlay.getBoundingClientRect();
    const catBox = cats?.getBoundingClientRect();
    const missing: string[] = [];
    const clipped: string[] = [];
    const categoryClipped: string[] = [];
    for (const id of testIds) {
      const el = document.querySelector(`[data-testid="${id}"]`);
      if (!(el instanceof HTMLElement)) {
        missing.push(id);
        continue;
      }
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const shown =
        cs.display !== 'none' &&
        cs.visibility !== 'hidden' &&
        r.width > 0 &&
        r.height > 0;
      if (!shown) {
        missing.push(id);
        continue;
      }
      const insideOverlay =
        r.left >= outer.left - 1 &&
        r.right <= outer.right + 1 &&
        r.top >= outer.top - 1 &&
        r.bottom <= outer.bottom + 1;
      if (!insideOverlay) clipped.push(id);
      if (id.startsWith('landscape-ticker-category-') && catBox) {
        const insideCats =
          r.left >= catBox.left - 1 &&
          r.right <= catBox.right + 1 &&
          r.top >= catBox.top - 1 &&
          r.bottom <= catBox.bottom + 1;
        if (!insideCats) categoryClipped.push(id);
      }
    }
    return { missing, clipped, categoryClipped };
  }, ids);
  expect(report.missing, JSON.stringify(report)).toEqual([]);
  expect(report.clipped, JSON.stringify(report)).toEqual([]);
  expect(report.categoryClipped, JSON.stringify(report)).toEqual([]);
}

export async function assertTabCycleStaysInDialog(page: Page): Promise<void> {
  const dialog = page.getByTestId('expanded-rating-ticker-drawer');
  await dialog.focus();
  for (let i = 0; i < 24; i += 1) {
    await page.keyboard.press('Tab');
    const loc = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="expanded-rating-ticker-drawer"]');
      const el = document.activeElement;
      if (!(el instanceof Element) || !root) {
        return { inDialog: false, testId: null, tag: el?.nodeName ?? 'none', hidden: true };
      }
      const cs = getComputedStyle(el);
      const hidden =
        Boolean(el.closest('[hidden],[inert]')) ||
        el.hasAttribute('hidden') ||
        cs.display === 'none' ||
        cs.visibility === 'hidden';
      return {
        inDialog: root.contains(el),
        testId: el.getAttribute('data-testid'),
        tag: el.tagName,
        hidden,
      };
    });
    expect(loc.inDialog, `tab ${i} left dialog ${JSON.stringify(loc)}`).toBe(true);
    expect(loc.hidden, `tab ${i} landed on hidden ${JSON.stringify(loc)}`).toBe(false);
  }
}

export async function assertExpandDisplay(
  page: Page,
  testId: 'rating-ticker-expand-mobile' | 'rating-comparison-expand-mobile',
  visible: boolean,
): Promise<void> {
  const el = page.getByTestId(testId);
  await expect(el).toBeAttached();
  if (visible) {
    await expect(el).toBeVisible();
    const display = await el.evaluate((node) => getComputedStyle(node).display);
    expect(display).not.toBe('none');
    return;
  }
  await expect(el).toBeHidden();
  const display = await el.evaluate((node) => getComputedStyle(node).display);
  expect(display).toBe('none');
}
