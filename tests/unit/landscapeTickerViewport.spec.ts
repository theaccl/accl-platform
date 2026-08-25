import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  isLandscapeFitBox,
  isMaterialViewportChange,
  visualViewportBoxesEqual,
} from '../../lib/profile/landscapeTickerViewport';

test.describe('landscape ticker viewport helpers', () => {
  test('landscape fit follows measured visualViewport, not CSS orientation', () => {
    expect(isLandscapeFitBox({ width: 360, height: 800 })).toBe(false);
    expect(isLandscapeFitBox({ width: 667, height: 375 })).toBe(true);
    expect(isLandscapeFitBox({ width: 800, height: 360 })).toBe(true);
    expect(isLandscapeFitBox({ width: 883, height: 412 })).toBe(true);
    expect(isLandscapeFitBox({ width: 800, height: 330 })).toBe(true);
    expect(isLandscapeFitBox({ width: 883, height: 372 })).toBe(true);
    expect(isLandscapeFitBox({ width: 1280, height: 720 })).toBe(false);
    expect(isLandscapeFitBox({ width: 1920, height: 1080 })).toBe(false);
  });

  test('geometry equality and material change stay separate', () => {
    const a = { offsetTop: 0, offsetLeft: 0, width: 800, height: 360 };
    expect(visualViewportBoxesEqual(a, { ...a })).toBe(true);
    expect(visualViewportBoxesEqual(a, { ...a, height: 361 })).toBe(false);
    expect(isMaterialViewportChange({ width: 800, height: 360 }, { width: 800, height: 367 })).toBe(false);
    expect(isMaterialViewportChange({ width: 800, height: 360 }, { width: 667, height: 375 })).toBe(true);
  });

  test('subscription covers rotation and visualViewport channels', () => {
    const src = readFileSync(join(process.cwd(), 'lib/profile/landscapeTickerViewport.ts'), 'utf8');
    expect(src).toContain("addEventListener('resize'");
    expect(src).toContain("addEventListener('orientationchange'");
    expect(src).toContain("addEventListener?.('change'");
    expect(src).toContain("visualViewport?.addEventListener('resize'");
    expect(src).toContain("visualViewport?.addEventListener('scroll'");
    expect(src).toContain('requestAnimationFrame');
    expect(src).toContain('LANDSCAPE_TICKER_VIEWPORT_SETTLE_DELAYS_MS');
    expect(src).toContain('clearTimeout');
    expect(src).toContain('cancelAnimationFrame');
    expect(src).not.toContain('landscapeTickerSwipe');
  });
});
