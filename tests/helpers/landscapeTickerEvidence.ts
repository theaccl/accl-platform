import { expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { LANDSCAPE_TICKER_CATEGORIES } from '../../lib/profile/landscapeTickerCategories';
import {
  colorDistance,
  readPngRgba,
  rgbaEqual,
  samplePngPixel,
  type Rgba,
} from './pngRgba';

/**
 * Independent antialiasing budget for mixed cores on a dark chart:
 * older settled ~2px, dominant settled ~2.75px with dark casing, plus glow.
 * Declared before sampling. Do not raise this to fit an observed mixed pixel.
 */
export const CROSSING_PIXEL_TOLERANCE = 40;

/** R024 JSON proofs are not verification. They lacked image/sample/viewport binding. */
export const R024_PROOF_STATUS =
  'NON-AUTHORITATIVE — SUPERSEDED DUE TO IMAGE/SAMPLE AND VIEWPORT-BINDING FAILURE';

export type SeriesId = 'free_blitz' | 'free_rapid' | 'free_day';

const CLIP_PAD = 24;
const CLIP_SIZE = 48;

export type CrossingImageBinding = {
  filename: string;
  sha256: string;
  clipX: number;
  clipY: number;
  clipWidth: number;
  clipHeight: number;
  sampledPixelX: number;
  sampledPixelY: number;
  searchRadius: number;
  screenshotScale: 'css';
};

export type CaptureMode = 'live' | 'settled';

export type AnimationSnapshot = {
  playState: string;
  currentTime: number | null;
  duration: number | null;
  targetTestId: string | null;
};

export type AnimationCaptureState = {
  count: number;
  items: AnimationSnapshot[];
  invokedFinish: boolean;
  pausedForCapture: boolean;
  settlementMethod: 'animation.finish()' | 'none-live';
  finishFailures: string[];
  nonterminal: boolean;
  clockAdvancedMs: number;
  seekCurrentTimeMs: number | null;
  soughtAnimationCount: number;
};

export type CrossingProof = {
  expected: Rgba;
  sampled: Rgba;
  distanceToDominant: number;
  distanceToSeries: Record<SeriesId, number>;
  nearestCompetitorId: SeriesId;
  nearestCompetitorDistance: number;
  marginToNextNearest: number;
  tolerance: number;
  toleranceJustification: string;
  elementFromPointOwner: string | null;
  elementFromPointHitTestId: string | null;
  probe: CrossingProbe;
  captureMode: CaptureMode;
  animation: AnimationCaptureState;
  cssAnimationsFinished: boolean;
  sampleMethod: string;
  coincidenceKind: 'exact-shared-vertex' | 'segment-crossing';
  image: CrossingImageBinding;
  viewport: {
    innerWidth: number;
    innerHeight: number;
  };
  visualViewport: {
    width: number | null;
    height: number | null;
    offsetTop: number | null;
    offsetLeft: number | null;
  };
  devicePixelRatio: number;
  domOrder: Array<{
    index: number;
    testId: string | null;
    tagName: string;
    paintIndex: string | null;
    dominant: string | null;
    zIndex: string;
    revealPhase: string | null;
  }>;
  r024Proofs: typeof R024_PROOF_STATUS;
};

export function persistCrossingProof(
  state: string,
  proof: CrossingProof,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    state,
    r024Proofs: R024_PROOF_STATUS,
    sampledRgb: proof.sampled,
    expectedDominantRgb: proof.expected,
    distanceToDominant: proof.distanceToDominant,
    distanceToEverySeriesColor: proof.distanceToSeries,
    nearestCompetitorId: proof.nearestCompetitorId,
    nearestCompetitorDistance: proof.nearestCompetitorDistance,
    marginToNextNearest: proof.marginToNextNearest,
    acceptedTolerance: proof.tolerance,
    toleranceJustification: proof.toleranceJustification,
    elementFromPointOwner: proof.elementFromPointOwner,
    elementFromPointHitTestId: proof.elementFromPointHitTestId,
    crossingCoordinateSvg: { x: proof.probe.svgX, y: proof.probe.svgY },
    crossingCoordinateScreen: { x: proof.probe.screenX, y: proof.probe.screenY },
    sampledPixelCoordinate: { x: proof.image.sampledPixelX, y: proof.image.sampledPixelY },
    image: proof.image,
    viewport: proof.viewport,
    visualViewport: proof.visualViewport,
    devicePixelRatio: proof.devicePixelRatio,
    probe: proof.probe,
    captureMode: proof.captureMode,
    animation: proof.animation,
    cssAnimationsFinished: proof.cssAnimationsFinished,
    coincidenceKind: proof.coincidenceKind,
    sampleMethod: proof.sampleMethod,
    domOrder: proof.domOrder,
    ...extra,
  };
}

export const SERIES_STROKE_RGB: Record<SeriesId, Rgba> = {
  free_blitz: hexToRgb(LANDSCAPE_TICKER_CATEGORIES.find((c) => c.id === 'free_blitz')!.color),
  free_rapid: hexToRgb(LANDSCAPE_TICKER_CATEGORIES.find((c) => c.id === 'free_rapid')!.color),
  free_day: hexToRgb(LANDSCAPE_TICKER_CATEGORIES.find((c) => c.id === 'free_day')!.color),
};

function hexToRgb(hex: string): Rgba {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 255 };
}

export function evidenceDir(): string | null {
  const raw = process.env.LANDSCAPE_TICKER_EVIDENCE_DIR?.trim();
  return raw || null;
}

export function writeEvidenceJson(name: string, value: unknown): void {
  const dir = evidenceDir();
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8' });
}

function sha256Buf(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function distancesToSeries(sampled: Rgba): Record<SeriesId, number> {
  return {
    free_blitz: colorDistance(sampled, SERIES_STROKE_RGB.free_blitz),
    free_rapid: colorDistance(sampled, SERIES_STROKE_RGB.free_rapid),
    free_day: colorDistance(sampled, SERIES_STROKE_RGB.free_day),
  };
}

function qualifies(sampled: Rgba, expectedId: SeriesId, tolerance: number): {
  ok: boolean;
  distanceToSeries: Record<SeriesId, number>;
  nearestCompetitorId: SeriesId;
  nearestCompetitorDistance: number;
  marginToNextNearest: number;
} {
  const distanceToSeries = distancesToSeries(sampled);
  const others = (Object.keys(SERIES_STROKE_RGB) as SeriesId[])
    .filter((id) => id !== expectedId)
    .map((id) => ({ id, distance: distanceToSeries[id] }));
  const nearestOther = others.reduce((a, b) => (a.distance < b.distance ? a : b));
  const distanceToDominant = distanceToSeries[expectedId];
  return {
    ok: distanceToDominant <= tolerance && distanceToDominant < nearestOther.distance,
    distanceToSeries,
    nearestCompetitorId: nearestOther.id,
    nearestCompetitorDistance: nearestOther.distance,
    marginToNextNearest: nearestOther.distance - distanceToDominant,
  };
}

/** Search the persisted clip from the geometric pixel outward. Tolerance is not adjusted. */
export function findOwnedPixelInPng(
  png: Buffer,
  expectedId: SeriesId,
  originX: number,
  originY: number,
  tolerance: number,
): { x: number; y: number; sampled: Rgba; searchRadius: number } & ReturnType<typeof qualifies> {
  const { width, height } = readPngRgba(png);
  const maxR = Math.max(width, height);
  for (let r = 0; r <= maxR; r += 1) {
    let best: { x: number; y: number; sampled: Rgba; dist: number; q: ReturnType<typeof qualifies> } | null =
      null;
    for (let y = originY - r; y <= originY + r; y += 1) {
      for (let x = originX - r; x <= originX + r; x += 1) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        if (Math.max(Math.abs(x - originX), Math.abs(y - originY)) !== r) continue;
        const sampled = samplePngPixel(png, x, y);
        const q = qualifies(sampled, expectedId, tolerance);
        if (!q.ok) continue;
        const dist = q.distanceToSeries[expectedId];
        if (!best || dist < best.dist) best = { x, y, sampled, dist, q };
      }
    }
    if (best) {
      return {
        x: best.x,
        y: best.y,
        sampled: best.sampled,
        searchRadius: r,
        ...best.q,
      };
    }
  }
  const fallback = samplePngPixel(png, originX, originY);
  const q = qualifies(fallback, expectedId, tolerance);
  expect(
    q.ok,
    `no pixel in persisted clip within independent tolerance ${tolerance} uniquely nearer ${expectedId}; origin rgb(${fallback.r},${fallback.g},${fallback.b}) dist=${q.distanceToSeries[expectedId]} competitor=${q.nearestCompetitorId}:${q.nearestCompetitorDistance}`,
  ).toBe(true);
  return { x: originX, y: originY, sampled: fallback, searchRadius: 0, ...q };
}

export function assertStoredProofMatchesImage(proof: {
  sampledRgb: Rgba;
  image: CrossingImageBinding;
}, imageBytes: Buffer): void {
  expect(sha256Buf(imageBytes), 'persisted PNG SHA-256').toBe(proof.image.sha256);
  const recomputed = samplePngPixel(
    imageBytes,
    proof.image.sampledPixelX,
    proof.image.sampledPixelY,
  );
  expect(
    rgbaEqual(recomputed, proof.sampledRgb),
    `reopened PNG pixel (${proof.image.sampledPixelX},${proof.image.sampledPixelY}) rgb(${recomputed.r},${recomputed.g},${recomputed.b}) != stored rgb(${proof.sampledRgb.r},${proof.sampledRgb.g},${proof.sampledRgb.b})`,
  ).toBe(true);
}

export type CrossingProbe = {
  owner: string | null;
  hitTestId: string | null;
  dominant: string | null;
  paintIndex: string | null;
  zIndex: string | null;
  screenX: number | null;
  screenY: number | null;
  svgX: number | null;
  svgY: number | null;
  reason: string;
};

export async function probeSeriesCrossing(
  page: Page,
  seriesId: 'free_blitz' | 'free_rapid' | 'free_day',
  u: number,
): Promise<CrossingProbe> {
  return page.evaluate(
    ({ seriesId: id, u: frac }) => {
      const markers = [
        ...document.querySelectorAll<SVGCircleElement>(`[data-testid^="landscape-ticker-marker-${id}-"]`),
      ]
        .map((el) => ({
          cx: Number(el.getAttribute('cx')),
          cy: Number(el.getAttribute('cy')),
        }))
        .filter((pt) => Number.isFinite(pt.cx) && Number.isFinite(pt.cy))
        .sort((a, b) => a.cx - b.cx);
      if (markers.length < 2) {
        return {
          owner: null,
          hitTestId: null,
          dominant: null,
          paintIndex: null,
          zIndex: null,
          screenX: null,
          screenY: null,
          svgX: null,
          svgY: null,
          reason: 'missing-markers',
        };
      }
      const svgX = markers[0].cx + frac * (markers[1].cx - markers[0].cx);
      const svgY = markers[0].cy + frac * (markers[1].cy - markers[0].cy);
      const layer = document.querySelector(`[data-testid="landscape-ticker-path-${id}"]`);
      const svg =
        layer instanceof SVGSVGElement
          ? layer
          : (layer?.closest('svg') ??
            document.querySelector<SVGSVGElement>('[data-testid="landscape-ticker-chart-focus"]'));
      const ctm = svg?.getScreenCTM();
      if (!svg || !ctm) {
        return {
          owner: null,
          hitTestId: null,
          dominant: null,
          paintIndex: null,
          zIndex: null,
          screenX: null,
          screenY: null,
          svgX,
          svgY,
          reason: 'missing-svg',
        };
      }
      const pt = svg.createSVGPoint();
      pt.x = svgX;
      pt.y = svgY;
      const screen = pt.matrixTransform(ctm);
      const el = document.elementFromPoint(screen.x, screen.y);
      const group = el?.closest('[data-testid^="landscape-ticker-path-"]');
      const hit = el?.closest('[data-testid^="landscape-ticker-hit-"]');
      return {
        owner: group?.getAttribute('data-testid') ?? null,
        hitTestId: hit?.getAttribute('data-testid') ?? null,
        dominant: group?.getAttribute('data-dominant') ?? null,
        paintIndex: group?.getAttribute('data-paint-index') ?? null,
        zIndex: group instanceof HTMLElement || group instanceof SVGElement ? getComputedStyle(group).zIndex : null,
        screenX: screen.x,
        screenY: screen.y,
        svgX,
        svgY,
        reason: 'ok',
      };
    },
    { seriesId, u },
  );
}

export async function probeExactMarker(
  page: Page,
  seriesId: SeriesId,
  pointId: string,
): Promise<CrossingProbe> {
  return page.evaluate(
    ({ seriesId: id, pointId: pid }) => {
      const marker = document.getElementById(`landscape-ticker-marker-${id}-${pid}`);
      if (!(marker instanceof SVGCircleElement)) {
        return {
          owner: null,
          hitTestId: null,
          dominant: null,
          paintIndex: null,
          zIndex: null,
          screenX: null,
          screenY: null,
          svgX: null,
          svgY: null,
          reason: 'missing-marker',
        };
      }
      const svgX = Number(marker.getAttribute('cx'));
      const svgY = Number(marker.getAttribute('cy'));
      const layer = document.querySelector(`[data-testid="landscape-ticker-path-${id}"]`);
      const svg =
        layer instanceof SVGSVGElement
          ? layer
          : (layer?.closest('svg') ??
            document.querySelector<SVGSVGElement>('[data-testid="landscape-ticker-chart-focus"]'));
      const ctm = svg?.getScreenCTM();
      if (!svg || !ctm || !Number.isFinite(svgX) || !Number.isFinite(svgY)) {
        return {
          owner: null,
          hitTestId: null,
          dominant: null,
          paintIndex: null,
          zIndex: null,
          screenX: null,
          screenY: null,
          svgX,
          svgY,
          reason: 'missing-svg',
        };
      }
      const pt = svg.createSVGPoint();
      pt.x = svgX;
      pt.y = svgY;
      const screen = pt.matrixTransform(ctm);
      const el = document.elementFromPoint(screen.x, screen.y);
      const group = el?.closest('[data-testid^="landscape-ticker-path-"]');
      const hit = el?.closest('[data-testid^="landscape-ticker-hit-"]');
      return {
        owner: group?.getAttribute('data-testid') ?? null,
        hitTestId: hit?.getAttribute('data-testid') ?? marker.getAttribute('data-testid'),
        dominant: group?.getAttribute('data-dominant') ?? null,
        paintIndex: group?.getAttribute('data-paint-index') ?? null,
        zIndex:
          group instanceof HTMLElement || group instanceof SVGElement
            ? getComputedStyle(group).zIndex
            : null,
        screenX: screen.x,
        screenY: screen.y,
        svgX,
        svgY,
        reason: 'ok',
      };
    },
    { seriesId, pointId },
  );
}

export async function readAnimationState(page: Page): Promise<AnimationSnapshot[]> {
  return page.evaluate(() =>
    document.getAnimations().map((anim) => {
      const timing = anim.effect?.getComputedTiming();
      const duration = timing?.duration;
      const target =
        anim.effect && 'target' in anim.effect ? (anim.effect as KeyframeEffect).target : null;
      const testId =
        target instanceof Element
          ? (target.closest('[data-testid^="landscape-ticker-path-"]')?.getAttribute('data-testid') ??
            target.getAttribute('data-testid'))
          : null;
      return {
        playState: anim.playState,
        currentTime: typeof anim.currentTime === 'number' ? anim.currentTime : null,
        duration: typeof duration === 'number' ? duration : null,
        targetTestId: testId,
      };
    }),
  );
}

function animationNonterminal(items: AnimationSnapshot[]): boolean {
  return items.some(
    (item) =>
      item.currentTime != null &&
      item.duration != null &&
      item.duration > 0 &&
      item.currentTime > 0 &&
      item.currentTime < item.duration,
  );
}

export async function assertDominantCrossingPixel(
  page: Page,
  seriesId: SeriesId,
  u: number,
  options?: {
    clipSlug?: string;
    mode?: CaptureMode;
    pointId?: string;
    liveAtMs?: number;
  },
): Promise<CrossingProof> {
  const mode: CaptureMode = options?.mode ?? 'settled';
  const probe = options?.pointId
    ? await probeExactMarker(page, seriesId, options.pointId)
    : await probeSeriesCrossing(page, seriesId, u);
  expect(probe.reason).toBe('ok');
  expect(probe.owner).toBe(`landscape-ticker-path-${seriesId}`);
  expect(probe.dominant).toBe('true');
  expect(probe.screenX).toBeTruthy();
  expect(probe.screenY).toBeTruthy();

  let invokedFinish = false;
  let pausedForCapture = false;
  let finishFailures: string[] = [];
  let clockAdvancedMs = 0;
  let seekCurrentTimeMs: number | null = null;
  let soughtAnimationCount = 0;
  if (mode === 'settled') {
    const result = await page.evaluate(() => {
      const failures: string[] = [];
      for (const anim of document.getAnimations()) {
        try {
          anim.finish();
        } catch (err) {
          failures.push(err instanceof Error ? err.message : String(err));
        }
      }
      return failures;
    });
    finishFailures = result;
    expect(finishFailures, 'animation.finish() failures').toEqual([]);
    invokedFinish = true;
  } else {
    const liveAtMs = options?.liveAtMs;
    expect(liveAtMs, 'live capture requires a recorded nonterminal time').toBeGreaterThan(0);
    const recordedMs = Number(liveAtMs);
    await expect
      .poll(async () => {
        const items = await readAnimationState(page);
        return items.some(
          (item) =>
            item.playState !== 'finished' &&
            item.duration != null &&
            item.duration > recordedMs,
        );
      }, { message: 'waiting for a live animation longer than the recorded capture time' })
      .toBe(true);
    const seek = await page.evaluate((ms: number) => {
      const failures: string[] = [];
      let sought = 0;
      for (const anim of document.getAnimations()) {
        const duration = anim.effect?.getComputedTiming().duration;
        if (typeof duration !== 'number' || !(duration > ms) || ms <= 0) continue;
        if (anim.playState === 'finished') continue;
        try {
          anim.currentTime = ms;
          sought += 1;
        } catch (err) {
          failures.push(err instanceof Error ? err.message : String(err));
        }
      }
      return { failures, sought };
    }, recordedMs);
    expect(seek.failures, 'live currentTime seek failures').toEqual([]);
    expect(seek.sought, 'live capture must seek at least one nonterminal animation').toBeGreaterThan(0);
    seekCurrentTimeMs = recordedMs;
    soughtAnimationCount = seek.sought;
    await page.evaluate(() => {
      for (const anim of document.getAnimations()) anim.pause();
    });
    pausedForCapture = true;
  }

  const items = await readAnimationState(page);
  const animation: AnimationCaptureState = {
    count: items.length,
    items,
    invokedFinish,
    pausedForCapture,
    settlementMethod: invokedFinish ? 'animation.finish()' : 'none-live',
    finishFailures,
    nonterminal: animationNonterminal(items),
    clockAdvancedMs,
    seekCurrentTimeMs,
    soughtAnimationCount,
  };
  if (mode === 'live') {
    expect(animation.invokedFinish).toBe(false);
    expect(animation.nonterminal).toBe(true);
  }

  const metrics = await measureVisualViewport(page);
  const domOrder = await collectSvgLayerOrder(page);
  const clipX = Math.max(0, Math.round(probe.screenX as number) - CLIP_PAD);
  const clipY = Math.max(0, Math.round(probe.screenY as number) - CLIP_PAD);
  const png = await page.screenshot({
    clip: { x: clipX, y: clipY, width: CLIP_SIZE, height: CLIP_SIZE },
    scale: 'css',
  });
  const slug = options?.clipSlug ?? seriesId;
  const filename = `crossing-clip-${slug}.png`;
  const dir = evidenceDir() ?? tmpdir();
  mkdirSync(dir, { recursive: true });
  const abs = join(dir, filename);
  writeFileSync(abs, png);
  const disk = readFileSync(abs);
  const sha256 = sha256Buf(disk);
  const originX = Math.round(probe.screenX as number) - clipX;
  const originY = Math.round(probe.screenY as number) - clipY;
  const owned = findOwnedPixelInPng(disk, seriesId, originX, originY, CROSSING_PIXEL_TOLERANCE);
  const image: CrossingImageBinding = {
    filename,
    sha256,
    clipX,
    clipY,
    clipWidth: CLIP_SIZE,
    clipHeight: CLIP_SIZE,
    sampledPixelX: owned.x,
    sampledPixelY: owned.y,
    searchRadius: owned.searchRadius,
    screenshotScale: 'css',
  };
  assertStoredProofMatchesImage({ sampledRgb: owned.sampled, image }, disk);
  return {
    expected: SERIES_STROKE_RGB[seriesId],
    sampled: owned.sampled,
    distanceToDominant: owned.distanceToSeries[seriesId],
    distanceToSeries: owned.distanceToSeries,
    nearestCompetitorId: owned.nearestCompetitorId,
    nearestCompetitorDistance: owned.nearestCompetitorDistance,
    marginToNextNearest: owned.marginToNextNearest,
    tolerance: CROSSING_PIXEL_TOLERANCE,
    toleranceJustification:
      'Independent 40-unit Euclidean budget for mixed cores (older ~2px, dominant ~2.75px plus casing) and glow. Not fitted to a sampled result. Pixel may be the nearest qualifying neighbor inside the persisted clip.',
    elementFromPointOwner: probe.owner,
    elementFromPointHitTestId: probe.hitTestId,
    probe,
    captureMode: mode,
    animation,
    cssAnimationsFinished: invokedFinish && finishFailures.length === 0,
    coincidenceKind: options?.pointId ? 'exact-shared-vertex' : 'segment-crossing',
    sampleMethod:
      'CSS-scale 48×48 clip around round(screenX, screenY); RGB from the nearest clip pixel within independent tolerance 40 that is uniquely nearer the expected series; PNG reopened and resampled before return.',
    image,
    viewport: { innerWidth: metrics.innerWidth, innerHeight: metrics.innerHeight },
    visualViewport: {
      width: metrics.visualViewportWidth,
      height: metrics.visualViewportHeight,
      offsetTop: metrics.visualViewportOffsetTop,
      offsetLeft: metrics.visualViewportOffsetLeft,
    },
    devicePixelRatio: metrics.devicePixelRatio,
    domOrder,
    r024Proofs: R024_PROOF_STATUS,
  };
}

export type ViewportMeasurement = {
  innerWidth: number;
  innerHeight: number;
  visualViewportWidth: number | null;
  visualViewportHeight: number | null;
  visualViewportOffsetTop: number | null;
  visualViewportOffsetLeft: number | null;
  devicePixelRatio: number;
  documentScrollWidth: number;
  documentScrollHeight: number;
  overlay: { x: number; y: number; width: number; height: number } | null;
  chart: { x: number; y: number; width: number; height: number } | null;
  browserChromeSimulated: false;
  note: string;
};

export async function measureVisualViewport(page: Page): Promise<ViewportMeasurement> {
  const overlay = await page.getByTestId('expanded-rating-ticker-drawer').boundingBox();
  const chart = await page.getByTestId('landscape-ticker-chart').boundingBox();
  const metrics = await page.evaluate(() => {
    const vv = window.visualViewport;
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      visualViewportWidth: vv?.width ?? null,
      visualViewportHeight: vv?.height ?? null,
      visualViewportOffsetTop: vv?.offsetTop ?? null,
      visualViewportOffsetLeft: vv?.offsetLeft ?? null,
      devicePixelRatio: window.devicePixelRatio,
      documentScrollWidth: document.documentElement.scrollWidth,
      documentScrollHeight: document.documentElement.scrollHeight,
    };
  });
  return {
    ...metrics,
    overlay: overlay
      ? { x: overlay.x, y: overlay.y, width: overlay.width, height: overlay.height }
      : null,
    chart: chart ? { x: chart.x, y: chart.y, width: chart.width, height: chart.height } : null,
    browserChromeSimulated: false,
    note: 'Playwright setViewportSize; no mobile browser chrome inset was simulated. visualViewport typically equals innerWidth/innerHeight.',
  };
}

export async function collectEngineReport(page: Page) {
  return page.evaluate(() => ({
    userAgent: navigator.userAgent,
    vendor: navigator.vendor,
    platform: navigator.platform,
    devicePixelRatio: window.devicePixelRatio,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    visualViewportWidth: window.visualViewport?.width ?? null,
    visualViewportHeight: window.visualViewport?.height ?? null,
    maxTouchPoints: navigator.maxTouchPoints,
    physicalAndroid: false,
    adbConnected: false,
  }));
}

export async function collectSvgLayerOrder(page: Page) {
  return page.locator('[data-testid^="landscape-ticker-path-"]').evaluateAll((nodes) =>
    nodes.map((n, i) => ({
      index: i,
      testId: n.getAttribute('data-testid'),
      tagName: n.tagName,
      paintIndex: n.getAttribute('data-paint-index'),
      dominant: n.getAttribute('data-dominant'),
      zIndex: getComputedStyle(n).zIndex,
      revealPhase: n.getAttribute('data-reveal-phase'),
    })),
  );
}

export async function collectDialogFocusOrder(page: Page) {
  return page.evaluate(() => {
    const dialog = document.querySelector<HTMLElement>('[data-testid="expanded-rating-ticker-drawer"]');
    if (!dialog) return { tabStops: [], hiddenFocusable: [], ariaHiddenWithFocusable: [] };
    const candidates = [
      ...dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ];
    const isShown = (el: HTMLElement) => {
      if (el.closest('[inert]')) return false;
      if (el.closest('[hidden]')) return false;
      if (el.hasAttribute('hidden')) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    };
    const tabStops = candidates.filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1 && isShown(el)).map(
      (el) => ({
        testId: el.getAttribute('data-testid'),
        tag: el.tagName,
        text: (el.textContent ?? '').trim().slice(0, 80),
      }),
    );
    const hiddenFocusable = candidates
      .filter((el) => {
        const hidden = Boolean(el.closest('[hidden]') || el.hasAttribute('hidden') || getComputedStyle(el).display === 'none');
        return hidden && (el.matches('a[href], button, [tabindex]:not([tabindex="-1"])'));
      })
      .map((el) => ({
        testId: el.getAttribute('data-testid'),
        tag: el.tagName,
        display: getComputedStyle(el).display,
        hiddenAttr: el.closest('[hidden]') !== null,
      }));
    const ariaHiddenWithFocusable = [...dialog.querySelectorAll<HTMLElement>('[aria-hidden="true"]')]
      .filter((wrap) => !wrap.inert && !wrap.hasAttribute('inert'))
      .filter((wrap) =>
        [...wrap.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )].some((el) => {
          if (el.hasAttribute('disabled') || el.tabIndex === -1) return false;
          const cs = getComputedStyle(el);
          return cs.display !== 'none';
        }),
      )
      .map((wrap) => wrap.getAttribute('data-testid') ?? wrap.id ?? wrap.tagName);
    return { tabStops, hiddenFocusable, ariaHiddenWithFocusable };
  });
}
