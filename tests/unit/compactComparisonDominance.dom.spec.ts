import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { mountComparisonPanel } from '../helpers/mountComparisonPage';

const LEGEND_ORDER = [
  'major-family-legend-tournament',
  'major-family-legend-bullet',
  'major-family-legend-blitz',
  'major-family-legend-rapid',
  'major-family-legend-daily',
];

function captureDir(testInfo: TestInfo): string {
  const raw = process.env.COMPACT_COMPARISON_CAPTURE_DIR?.trim() || process.env.LANDSCAPE_TICKER_CAPTURE_DIR?.trim();
  const dest =
    raw && raw !== '1' && raw.toLowerCase() !== 'true' && raw !== 'playwright-output'
      ? raw
      : join(process.env.USERPROFILE ?? process.cwd(), 'accl-ticker-017-audit', 'actual-component');
  mkdirSync(dest, { recursive: true });
  void testInfo;
  return dest;
}

async function legendButtonOrder(page: Page): Promise<string[]> {
  return page
    .getByTestId('major-family-legend')
    .locator('button')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-testid') ?? ''));
}

async function seriesGroupOrder(page: Page): Promise<string[]> {
  return page.locator('[data-testid^="multi-line-series-group-"]').evaluateAll((nodes) =>
    nodes.map((n) => (n.getAttribute('data-testid') ?? '').replace('multi-line-series-group-', '')),
  );
}

async function ownerAtCompactEventJump(page: Page, seriesId: 'free_blitz' | 'free_rapid') {
  return page.evaluate(
    (id) => {
      const markers = [...document.querySelectorAll<SVGCircleElement>(`circle[data-testid="multi-line-point-${id}"]`)]
        .map((el) => ({
          cx: Number(el.getAttribute('cx')),
          cy: Number(el.getAttribute('cy')),
        }))
        .filter((pt) => Number.isFinite(pt.cx) && Number.isFinite(pt.cy))
        .sort((a, b) => a.cx - b.cx);
      if (markers.length < 2) {
        return { owner: null, dominant: null, reason: 'missing-markers', count: markers.length };
      }
      const x = markers[1].cx;
      const y = (markers[0].cy + markers[1].cy) / 2;
      const svg = document.querySelector<SVGSVGElement>('[data-testid="multi-line-rating-chart-svg"]');
      const ctm = svg?.getScreenCTM();
      if (!svg || !ctm) {
        return { owner: null, dominant: null, reason: 'missing-svg', count: markers.length };
      }
      const pt = svg.createSVGPoint();
      pt.x = x;
      pt.y = y;
      const screen = pt.matrixTransform(ctm);
      const el = document.elementFromPoint(screen.x, screen.y);
      const group = el?.closest('[data-testid^="multi-line-series-group-"]');
      return {
        owner: group?.getAttribute('data-testid') ?? null,
        dominant: group?.getAttribute('data-dominant') ?? null,
        reason: 'ok',
        count: markers.length,
      };
    },
    seriesId,
  );
}

async function prepareCrossingChart(page: Page): Promise<void> {
  await page.clock.install({ time: new Date('2026-08-30T12:00:00Z') });
  await mountComparisonPanel(page, {
    crossing: true,
    viewport: { width: 360, height: 800 },
  });
  await page.getByTestId('comparison-lane-tab-overall').click();
  await page.getByTestId('rating-family-comparison-panel').waitFor();
}

async function selectRapidThenBlitz(page: Page): Promise<void> {
  await page.getByTestId('major-family-legend-rapid').click();
  await page.getByTestId('major-family-legend-blitz').click();
  await page.getByTestId('multi-line-rating-chart').waitFor();
}

async function selectBlitzLast(page: Page): Promise<void> {
  await page.getByTestId('major-family-legend-blitz').click();
  await page.getByTestId('major-family-legend-blitz').click();
}

test.describe('compact comparison dominance (real component)', () => {
  test('fresh compact mount is empty with fixed legend order', async ({ page }) => {
    await prepareCrossingChart(page);
    const panel = page.getByTestId('rating-family-comparison-panel');
    await expect(panel).toHaveAttribute('data-empty-open', 'true');
    await expect(panel).toHaveAttribute('data-dominance-order', 'none');
    await expect(panel).toHaveAttribute('data-dominant-category', 'none');
    await expect(page.getByTestId('multi-line-rating-chart')).toHaveCount(0);
    await expect(page.locator('[data-testid^="multi-line-series-"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="multi-line-point-"]')).toHaveCount(0);
    await expect(page.getByTestId('comparison-all-hidden')).toHaveText('Select ratings to compare.');
    expect(await legendButtonOrder(page)).toEqual(LEGEND_ORDER);
    for (const id of LEGEND_ORDER) {
      await expect(page.getByTestId(id)).toHaveAttribute('aria-pressed', 'false');
    }
    await expect(page.locator('[data-ticker-anim]')).toHaveCount(0);
    await expect(page.getByTestId('expanded-rating-ticker-drawer')).toHaveCount(0);
  });

  test('selecting Blitz last paints it after Rapid and owns the crossing', async ({ page }) => {
    await prepareCrossingChart(page);
    await selectRapidThenBlitz(page);
    await expect(page.getByTestId('rating-family-comparison-panel')).toHaveAttribute(
      'data-dominance-order',
      'free_rapid free_blitz',
    );
    expect(await seriesGroupOrder(page)).toEqual(['free_rapid', 'free_blitz']);
    await expect(page.getByTestId('multi-line-series-group-free_blitz')).toHaveAttribute(
      'data-dominant',
      'true',
    );

    await selectBlitzLast(page);
    expect(await seriesGroupOrder(page)).toEqual(['free_rapid', 'free_blitz']);
    await expect(page.getByTestId('multi-line-series-group-free_blitz')).toHaveAttribute(
      'data-dominant',
      'true',
    );
    await expect(page.getByTestId('rating-family-comparison-panel')).toHaveAttribute(
      'data-dominant-category',
      'free_blitz',
    );

    const hit = await ownerAtCompactEventJump(page, 'free_blitz');
    expect(hit.reason).toBe('ok');
    expect(hit.owner).toBe('multi-line-series-group-free_blitz');
    expect(hit.dominant).toBe('true');

    const blitzRatings = await page
      .locator('[data-testid="multi-line-point-free_blitz"]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-rating-after')));
    expect(blitzRatings).toEqual(['1600', '1400', '1600']);
    const rapidTimes = await page
      .locator('[data-testid="multi-line-point-free_rapid"]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-occurred-at')));
    expect(rapidTimes).toEqual([
      '2026-08-01T12:00:00Z',
      '2026-08-15T12:00:00Z',
      '2026-08-29T12:00:00Z',
    ]);
    expect(await legendButtonOrder(page)).toEqual(LEGEND_ORDER);
  });

  test('Daily becomes front-most, removal exposes Blitz, Rapid reselect moves front', async ({
    page,
  }) => {
    await prepareCrossingChart(page);
    await selectRapidThenBlitz(page);
    await selectBlitzLast(page);
    expect(await seriesGroupOrder(page)).toEqual(['free_rapid', 'free_blitz']);

    await page.getByTestId('major-family-legend-daily').click();
    expect(await seriesGroupOrder(page)).toEqual(['free_rapid', 'free_blitz', 'free_day']);
    await expect(page.getByTestId('multi-line-series-group-free_day')).toHaveAttribute(
      'data-dominant',
      'true',
    );

    await page.getByTestId('major-family-legend-daily').click();
    expect(await seriesGroupOrder(page)).toEqual(['free_rapid', 'free_blitz']);
    await expect(page.getByTestId('multi-line-series-group-free_blitz')).toHaveAttribute(
      'data-dominant',
      'true',
    );

    await page.getByTestId('major-family-legend-rapid').click();
    await page.getByTestId('major-family-legend-rapid').click();
    expect(await seriesGroupOrder(page)).toEqual(['free_blitz', 'free_rapid']);
    await expect(page.getByTestId('multi-line-series-group-free_rapid')).toHaveAttribute(
      'data-dominant',
      'true',
    );
    const hit = await ownerAtCompactEventJump(page, 'free_rapid');
    expect(hit.owner).toBe('multi-line-series-group-free_rapid');
    expect(await legendButtonOrder(page)).toEqual(LEGEND_ORDER);
    await expect(page.locator('[data-ticker-anim]')).toHaveCount(0);
  });

  test('compact dominance captures at 360x800 and 800x360', async ({ page }, testInfo) => {
    const dir = captureDir(testInfo);
    const shot = (name: string) => join(dir, name);

    await prepareCrossingChart(page);
    await selectRapidThenBlitz(page);
    await page.screenshot({ path: shot('c01-rapid-selected-before-blitz-360x800.png'), fullPage: true });

    await selectBlitzLast(page);
    await page.screenshot({ path: shot('c02-blitz-crosses-above-rapid-360x800.png'), fullPage: true });

    await page.getByTestId('major-family-legend-daily').click();
    await page.screenshot({ path: shot('c03-daily-front-above-both-360x800.png'), fullPage: true });

    await page.getByTestId('major-family-legend-daily').click();
    await page.screenshot({ path: shot('c04-daily-removed-blitz-front-360x800.png'), fullPage: true });

    await page.getByTestId('major-family-legend-rapid').click();
    await page.getByTestId('major-family-legend-rapid').click();
    await page.screenshot({ path: shot('c05-rapid-reselected-front-360x800.png'), fullPage: true });

    await mountComparisonPanel(page, {
      crossing: true,
      viewport: { width: 800, height: 360 },
    });
    await page.getByTestId('comparison-lane-tab-overall').click();
    await selectRapidThenBlitz(page);
    await page.screenshot({ path: shot('c06-rapid-selected-before-blitz-800x360.png'), fullPage: true });

    await selectBlitzLast(page);
    await page.screenshot({ path: shot('c07-blitz-crosses-above-rapid-800x360.png'), fullPage: true });

    await page.getByTestId('major-family-legend-daily').click();
    await page.screenshot({ path: shot('c08-daily-front-above-both-800x360.png'), fullPage: true });

    await page.getByTestId('major-family-legend-daily').click();
    await page.screenshot({ path: shot('c09-daily-removed-blitz-front-800x360.png'), fullPage: true });

    await page.getByTestId('major-family-legend-rapid').click();
    await page.getByTestId('major-family-legend-rapid').click();
    await page.screenshot({ path: shot('c10-rapid-reselected-front-800x360.png'), fullPage: true });

    expect(existsSync(shot('c01-rapid-selected-before-blitz-360x800.png'))).toBe(true);
    expect(existsSync(shot('c07-blitz-crosses-above-rapid-800x360.png'))).toBe(true);
    expect(await seriesGroupOrder(page)).toEqual(['free_blitz', 'free_rapid']);
  });
});
