import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  BLITZ_RAPID_CROSS_U,
  DAILY_RAPID_FIRST_CROSS_U,
} from '../helpers/landscapeTickerCrossingFixture';
import {
  assertDominantCrossingPixel,
  assertStoredProofMatchesImage,
  collectDialogFocusOrder,
  collectEngineReport,
  collectSvgLayerOrder,
  evidenceDir,
  measureVisualViewport,
  persistCrossingProof,
  probeSeriesCrossing,
  R024_PROOF_STATUS,
  writeEvidenceJson,
} from '../helpers/landscapeTickerEvidence';
import { mountComparisonPanel } from '../helpers/mountComparisonPage';
import { mountLandscapeTicker } from '../helpers/mountLandscapeTickerPage';

const FREE_CATEGORY_IDS = [
  'landscape-ticker-category-accl',
  'landscape-ticker-category-tournament',
  'landscape-ticker-category-bullet',
  'landscape-ticker-category-blitz',
  'landscape-ticker-category-rapid',
  'landscape-ticker-category-daily',
];

const TIME_CONTROL_IDS = [
  'rating-lane-tab-day',
  'rating-lane-tab-week',
  'rating-lane-tab-month',
  'rating-lane-tab-year',
  'rating-lane-tab-overall',
];

const VIEWPORTS = [
  { width: 360, height: 800 },
  { width: 800, height: 360 },
  { width: 667, height: 375 },
] as const;

function captureDir(testInfo: TestInfo): string | null {
  const raw = process.env.LANDSCAPE_TICKER_CAPTURE_DIR?.trim();
  if (!raw) return null;
  if (raw === '1' || raw.toLowerCase() === 'true' || raw === 'playwright-output') {
    return testInfo.outputPath('actual-component');
  }
  return raw;
}

async function ownerAtSeriesCrossing(
  page: Page,
  seriesId: 'free_blitz' | 'free_rapid' | 'free_day',
  u: number,
) {
  return probeSeriesCrossing(page, seriesId, u);
}

async function paintOrder(page: Page): Promise<string[]> {
  return page.locator('[data-testid^="landscape-ticker-path-"]').evaluateAll((nodes) =>
    nodes.map((n) => (n.getAttribute('data-testid') ?? '').replace('landscape-ticker-path-', '')),
  );
}

async function assertEssentialControlsInViewport(page: Page) {
  const metrics = await measureVisualViewport(page);
  const vw = metrics.visualViewportWidth ?? metrics.innerWidth;
  const vh = metrics.visualViewportHeight ?? metrics.innerHeight;
  const ids = [
    'expanded-ticker-close',
    'landscape-ticker-family-free',
    'landscape-ticker-family-battlefield',
    'landscape-ticker-family-kptv',
    'landscape-ticker-chart',
    ...FREE_CATEGORY_IDS,
    ...TIME_CONTROL_IDS,
  ];
  for (const id of ids) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box, id).toBeTruthy();
    expect(box!.x + 1 >= 0, id).toBe(true);
    expect(box!.y + 1 >= 0, id).toBe(true);
    expect(box!.x + box!.width <= vw + 2, id).toBe(true);
    expect(box!.y + box!.height <= vh + 2, id).toBe(true);
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  }
  expect(metrics.overlay).toBeTruthy();
  expect(metrics.overlay!.width).toBeLessThanOrEqual((metrics.visualViewportWidth ?? vw) + 2);
  expect(metrics.overlay!.height).toBeLessThanOrEqual((metrics.visualViewportHeight ?? vh) + 2);
  return metrics;
}

async function assertNoOverlayScrollLeak(page: Page) {
  const leak = await page.evaluate(() => ({
    bodyOverflow: document.body.style.overflow,
    htmlOverflow: document.documentElement.style.overflow,
    bodyLock: document.body.dataset.landscapeTickerScrollLock ?? null,
    bodyScroll: document.body.scrollTop,
    htmlScroll: document.documentElement.scrollTop,
  }));
  expect(leak.bodyOverflow).toBe('hidden');
  expect(leak.htmlOverflow).toBe('hidden');
  expect(leak.bodyLock).toBe('true');
  expect(leak.bodyScroll).toBe(0);
  expect(leak.htmlScroll).toBe(0);
}

async function runDominanceSequence(page: Page) {
  const drawer = page.getByTestId('expanded-rating-ticker-drawer');
  const chart = page.getByTestId('landscape-ticker-chart');

  await expect(chart).toHaveAttribute('data-empty-open', 'true');
  await expect(page.locator('[data-testid^="landscape-ticker-path-"]')).toHaveCount(0);

  await page.getByTestId('landscape-ticker-category-rapid').click();
  await page.clock.fastForward(50);
  await expect(drawer).toHaveAttribute('data-dominance-order', 'free_rapid');
  await expect(chart).toHaveAttribute('data-dominant-category', 'free_rapid');
  expect(await paintOrder(page)).toEqual(['free_rapid']);

  await page.getByTestId('landscape-ticker-category-blitz').click();
  await expect(page.getByTestId('landscape-ticker-path-free_blitz')).toHaveCount(0);
  await expect(drawer).toHaveAttribute('data-dominance-order', 'free_rapid');
  await page.clock.fastForward(1800);
  await expect(chart).toHaveAttribute('data-dominant-category', 'free_blitz');
  expect(await paintOrder(page)).toEqual(['free_rapid', 'free_blitz']);
  const blitzFront = await assertDominantCrossingPixel(page, 'free_blitz', BLITZ_RAPID_CROSS_U, {
    clipSlug: 'blitz-above-rapid',
  });
  expect(blitzFront.probe.owner).toBe('landscape-ticker-path-free_blitz');
  expect(blitzFront.probe.hitTestId).toBe('landscape-ticker-hit-free_blitz');
  await expect(page.getByTestId('landscape-ticker-path-free_blitz')).toHaveCSS('z-index', '2');
  await expect(page.getByTestId('landscape-ticker-path-free_rapid')).toHaveCSS('z-index', '1');

  await page.getByTestId('landscape-ticker-category-daily').click();
  await page.clock.fastForward(1800);
  await expect(chart).toHaveAttribute('data-dominant-category', 'free_day');
  expect(await paintOrder(page)).toEqual(['free_rapid', 'free_blitz', 'free_day']);
  const dailyFront = await assertDominantCrossingPixel(page, 'free_day', DAILY_RAPID_FIRST_CROSS_U, {
    clipSlug: 'daily-above-rapid',
  });
  expect(dailyFront.probe.hitTestId).toBe('landscape-ticker-hit-free_day');

  await page.getByTestId('landscape-ticker-category-blitz').click();
  await expect(chart).toHaveAttribute('data-dominant-category', 'free_day');
  expect(await paintOrder(page)).toEqual(['free_rapid', 'free_day']);

  await page.getByTestId('landscape-ticker-category-blitz').click();
  await expect(page.getByTestId('landscape-ticker-category-blitz')).toHaveAttribute(
    'data-hero-revealed',
    'true',
  );
  await expect(page.getByTestId('landscape-ticker-perimeter')).toHaveAttribute(
    'data-pulse-active',
    'false',
  );
  const reselectPhase = await page.getByTestId('landscape-ticker-path-free_blitz').getAttribute(
    'data-reveal-phase',
  );
  expect(reselectPhase === 'quiet' || reselectPhase === 'settled').toBe(true);
  expect(reselectPhase).not.toBe('hero');
  await page.clock.fastForward(500);
  await expect(chart).toHaveAttribute('data-dominant-category', 'free_blitz');
  expect(await paintOrder(page)).toEqual(['free_rapid', 'free_day', 'free_blitz']);
  const blitzQuiet = await assertDominantCrossingPixel(page, 'free_blitz', BLITZ_RAPID_CROSS_U, {
    clipSlug: 'blitz-reselected-quiet',
  });
  expect(blitzQuiet.probe.hitTestId).toBe('landscape-ticker-hit-free_blitz');

  await page.getByTestId('landscape-ticker-chart-focus').focus();
  await page.keyboard.press('Home');
  await expect(page.getByTestId('landscape-ticker-point-detail')).toContainText('Blitz');
  return {
    blitzAboveRapid: blitzFront,
    dailyAboveRapid: dailyFront,
    blitzReselectedQuiet: blitzQuiet,
  };
}

test.describe('mobile real-data dominance and landscape fit', () => {
  test.describe.configure({ timeout: 60_000 });
  for (const viewport of VIEWPORTS) {
    test(`track Expand dominance at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
      await mountLandscapeTicker(page, { crossing: true, viewport });
      await page.clock.fastForward(50);
      await assertNoOverlayScrollLeak(page);
      await runDominanceSequence(page);
      const shortLandscape =
        viewport.width >= viewport.height && viewport.height <= 500;
      const metrics = shortLandscape
        ? await assertEssentialControlsInViewport(page)
        : await measureVisualViewport(page);
      writeEvidenceJson(`viewport-${viewport.width}x${viewport.height}.json`, metrics);
      writeEvidenceJson(
        `svg-layers-${viewport.width}x${viewport.height}.json`,
        await collectSvgLayerOrder(page),
      );
      if (shortLandscape) {
        const body = page.getByTestId('landscape-ticker-body-scroll');
        expect(
          await body.evaluate((el) => el.scrollHeight <= el.clientHeight + 2),
        ).toBe(true);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
        ).toBe(true);
      }
    });
  }

  test('Compare-major-ratings Expand uses the same overlay and dominance', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-30T12:00:00Z') });
    await mountComparisonPanel(page, { crossing: true, viewport: { width: 360, height: 800 } });
    await page.getByTestId('comparison-lane-tab-overall').click();
    await page.getByTestId('rating-comparison-expand-mobile').click();
    await page.getByTestId('expanded-rating-ticker-drawer').waitFor();
    await expect(page.getByTestId('expanded-rating-comparison-drawer')).toHaveCount(0);
    await runDominanceSequence(page);
    await page.getByTestId('expanded-ticker-close').click();
    await expect(page.getByTestId('expanded-rating-ticker-drawer')).toHaveCount(0);
    await page.getByTestId('rating-comparison-expand-mobile').click();
    await expect(page.getByTestId('landscape-ticker-chart')).toHaveAttribute('data-empty-open', 'true');
    await expect(page.getByTestId('expanded-rating-ticker-drawer')).toHaveAttribute(
      'data-dominance-order',
      'none',
    );
  });

  test('track Expand close/reopen clears dominance', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { crossing: true, viewport: { width: 360, height: 800 } });
    await page.getByTestId('landscape-ticker-category-rapid').click();
    await page.clock.fastForward(1800);
    await page.getByTestId('expanded-ticker-close').click();
    await page.getByTestId('rating-ticker-expand-mobile').click();
    await expect(page.getByTestId('landscape-ticker-chart')).toHaveAttribute('data-empty-open', 'true');
    await expect(page.getByTestId('expanded-rating-ticker-drawer')).toHaveAttribute(
      'data-dominance-order',
      'none',
    );
    await expect(page.locator('[data-testid^="landscape-ticker-path-"]')).toHaveCount(0);
  });

  test('short landscape excludes hidden list from focus and records engine metrics', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { crossing: true, viewport: { width: 800, height: 360 } });
    await page.clock.fastForward(50);
    writeEvidenceJson('engine-report.json', {
      ...(await collectEngineReport(page)),
      playwrightProject: 'unit',
      playwrightDevicePreset: 'Desktop Chrome',
      hostOs: process.platform,
      physicalAndroidBrowsers: {
        'Chrome Android': 'unverified — no ADB device',
        'Edge Android': 'unverified — no ADB device',
        'Samsung Internet': 'unverified — no ADB device',
      },
    });
    const proofs = await runDominanceSequence(page);
    expect(proofs.blitzAboveRapid.r024Proofs).toBe(R024_PROOF_STATUS);
    const persisted = [
      {
        file: 'crossing-proof-blitz-above-rapid.json',
        proof: persistCrossingProof('Blitz above Rapid', proofs.blitzAboveRapid, {
          sequenceStep: 'after Rapid then Blitz settle',
        }),
      },
      {
        file: 'crossing-proof-daily-above-rapid.json',
        proof: persistCrossingProof('Daily above Rapid', proofs.dailyAboveRapid, {
          sequenceStep: 'after Rapid then Blitz then Daily settle',
        }),
      },
      {
        file: 'crossing-proof-blitz-reselected-quiet.json',
        proof: persistCrossingProof('quietly reselected Blitz above the remaining lines', proofs.blitzReselectedQuiet, {
          sequenceStep: 'after deselect Blitz then reselect Blitz (quiet/settled, not hero)',
        }),
      },
    ];
    for (const row of persisted) {
      const viewport = row.proof.viewport as { innerWidth: number; innerHeight: number };
      expect(viewport.innerWidth).toBeGreaterThan(0);
      expect(viewport.innerHeight).toBeGreaterThan(0);
      writeEvidenceJson(row.file, row.proof);
    }
    const dir = evidenceDir();
    if (dir) {
      for (const row of persisted) {
        const json = JSON.parse(readFileSync(join(dir, row.file), 'utf8')) as {
          sampledRgb: { r: number; g: number; b: number; a: number };
          image: {
            filename: string;
            sha256: string;
            sampledPixelX: number;
            sampledPixelY: number;
            clipX: number;
            clipY: number;
            clipWidth: number;
            clipHeight: number;
            searchRadius: number;
            screenshotScale: 'css';
          };
        };
        const imageBytes = readFileSync(join(dir, json.image.filename));
        assertStoredProofMatchesImage(json, imageBytes);
      }
    }
    writeEvidenceJson('viewport-800x360-post-sequence.json', await measureVisualViewport(page));
    writeEvidenceJson('svg-layers-800x360-post-sequence.json', await collectSvgLayerOrder(page));

    await expect(page.getByTestId('rating-ticker-point-list')).toHaveAttribute('hidden', '');
    await expect(page.getByTestId('landscape-ticker-series-summary')).toHaveAttribute('hidden', '');
    await expect(page.getByTestId('landscape-ticker-list-finished-link').first()).toBeAttached();
    await expect(page.getByTestId('landscape-ticker-list-finished-link').first()).not.toBeVisible();

    const focus = await collectDialogFocusOrder(page);
    writeEvidenceJson('a11y-focus-order.json', focus);
    expect(
      focus.tabStops.some(
        (s) =>
          s.testId === 'landscape-ticker-list-finished-link' ||
          s.testId === 'landscape-ticker-list-train-link',
      ),
    ).toBe(false);
    expect(focus.ariaHiddenWithFocusable).toEqual([]);
    expect(focus.hiddenFocusable.length).toBeGreaterThan(0);

    const afterProgrammatic = await page.evaluate(() => {
      const link = document.querySelector<HTMLElement>(
        '[data-testid="landscape-ticker-list-finished-link"]',
      );
      link?.focus();
      return {
        active: document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName,
        display: link ? getComputedStyle(link).display : null,
        listHidden: document
          .querySelector('[data-testid="rating-ticker-point-list"]')
          ?.hasAttribute('hidden'),
      };
    });
    expect(afterProgrammatic.listHidden).toBe(true);
    expect(afterProgrammatic.active).not.toBe('landscape-ticker-list-finished-link');

    await page.getByTestId('expanded-rating-ticker-drawer').focus();
    const tabSeen: Array<string | null> = [];
    for (let i = 0; i < 36; i += 1) {
      await page.keyboard.press('Tab');
      tabSeen.push(
        await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null),
      );
    }
    writeEvidenceJson('a11y-tab-order.json', { tabSeen });
    expect(tabSeen).not.toContain('landscape-ticker-list-finished-link');
    expect(tabSeen).not.toContain('landscape-ticker-list-train-link');

    const shiftSeen: Array<string | null> = [];
    for (let i = 0; i < 36; i += 1) {
      await page.keyboard.press('Shift+Tab');
      shiftSeen.push(
        await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null),
      );
    }
    writeEvidenceJson('a11y-shift-tab-order.json', { shiftSeen });
    expect(shiftSeen).not.toContain('landscape-ticker-list-finished-link');
    expect(shiftSeen).not.toContain('landscape-ticker-list-train-link');
  });

  test('capture mobile dominance crossings and fitted landscape', async ({ page }, testInfo) => {
    const dest = captureDir(testInfo);
    if (!dest) {
      test.skip(true, 'Set LANDSCAPE_TICKER_CAPTURE_DIR to write opt-in screenshots.');
      return;
    }
    mkdirSync(dest, { recursive: true });
    const shot = (name: string) => join(dest, name);

    await page.clock.install({ time: new Date('2026-08-21T16:30:00Z') });
    await mountLandscapeTicker(page, { crossing: true, viewport: { width: 360, height: 800 } });
    await page.screenshot({ path: shot('m01-empty-portrait-360x800.png'), fullPage: true });

    await page.getByTestId('landscape-ticker-category-rapid').click();
    await page.clock.fastForward(1800);
    await page.screenshot({ path: shot('m02-rapid-only-360x800.png'), fullPage: true });

    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.clock.fastForward(1800);
    await page.screenshot({ path: shot('m03-blitz-above-rapid-crossing-360x800.png'), fullPage: true });

    await page.getByTestId('landscape-ticker-category-daily').click();
    await page.clock.fastForward(1800);
    await page.screenshot({ path: shot('m04-daily-front-crossing-360x800.png'), fullPage: true });

    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.screenshot({ path: shot('m05-blitz-deselected-360x800.png'), fullPage: true });

    await page.getByTestId('landscape-ticker-category-blitz').click();
    await page.clock.fastForward(500);
    await page.screenshot({ path: shot('m06-blitz-reselected-front-360x800.png'), fullPage: true });

    await page.setViewportSize({ width: 800, height: 360 });
    await page.clock.fastForward(50);
    await page.screenshot({ path: shot('m07-fitted-landscape-800x360.png'), fullPage: true });

    await page.setViewportSize({ width: 667, height: 375 });
    await page.clock.fastForward(50);
    await page.screenshot({ path: shot('m08-fitted-landscape-667x375.png'), fullPage: true });

    await mountComparisonPanel(page, { crossing: true, viewport: { width: 360, height: 800 } });
    await page.getByTestId('comparison-lane-tab-overall').click();
    await page.screenshot({ path: shot('m09-compare-expand-entrypoint-360x800.png'), fullPage: true });
    await page.getByTestId('rating-comparison-expand-mobile').click();
    await page.getByTestId('expanded-rating-ticker-drawer').waitFor();
    await page.screenshot({ path: shot('m10-compare-expand-empty-overlay-360x800.png'), fullPage: true });
  });
});
