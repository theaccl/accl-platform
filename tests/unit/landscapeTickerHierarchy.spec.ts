import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  LANDSCAPE_TICKER_CASING_STROKE,
  LANDSCAPE_TICKER_RECESSED_MIN_CORE_OPACITY,
  landscapeTickerEmphasis,
  landscapeTickerStrokeStyle,
  paintedDominanceIds,
} from '../../lib/profile/landscapeTickerHierarchy';

test.describe('landscape ticker stroke hierarchy', () => {
  test('only front-most emphasis gets a contrasting casing', () => {
    expect(landscapeTickerStrokeStyle('hero').casing).toBeGreaterThan(0);
    expect(landscapeTickerStrokeStyle('quiet').casing).toBeGreaterThan(0);
    expect(landscapeTickerStrokeStyle('settled-front').casing).toBeGreaterThan(0);
    expect(landscapeTickerStrokeStyle('settled-back').casing).toBe(0);
    expect(landscapeTickerStrokeStyle('recessed').casing).toBe(0);
    expect(LANDSCAPE_TICKER_CASING_STROKE).toBe('#070b10');
  });

  test('older cores stay at or under the previous uniform 2.25px width', () => {
    expect(landscapeTickerStrokeStyle('settled-back').core).toBeLessThanOrEqual(2.25);
    expect(landscapeTickerStrokeStyle('recessed').core).toBeLessThanOrEqual(2.25);
    expect(landscapeTickerStrokeStyle('settled-front').core).toBeGreaterThan(
      landscapeTickerStrokeStyle('settled-back').core,
    );
    expect(landscapeTickerStrokeStyle('hero').core).toBeGreaterThan(
      landscapeTickerStrokeStyle('settled-front').core,
    );
  });

  test('recessed older lines stay above inaccessible contrast', () => {
    expect(landscapeTickerStrokeStyle('recessed').coreOpacity).toBeGreaterThanOrEqual(
      LANDSCAPE_TICKER_RECESSED_MIN_CORE_OPACITY,
    );
    expect(LANDSCAPE_TICKER_RECESSED_MIN_CORE_OPACITY).toBeGreaterThanOrEqual(0.75);
  });

  test('hero and quiet are temporary; settled-front remains the post-settlement distinction', () => {
    expect(
      landscapeTickerEmphasis({
        phase: 'hero',
        frontMost: true,
        revealActive: true,
        reducedMotion: false,
      }),
    ).toBe('hero');
    expect(
      landscapeTickerEmphasis({
        phase: 'quiet',
        frontMost: true,
        revealActive: true,
        reducedMotion: false,
      }),
    ).toBe('quiet');
    expect(
      landscapeTickerEmphasis({
        phase: 'settled',
        frontMost: true,
        revealActive: false,
        reducedMotion: false,
      }),
    ).toBe('settled-front');
    expect(
      landscapeTickerEmphasis({
        phase: 'settled',
        frontMost: false,
        revealActive: true,
        reducedMotion: false,
      }),
    ).toBe('recessed');
    expect(
      landscapeTickerEmphasis({
        phase: 'settled',
        frontMost: false,
        revealActive: false,
        reducedMotion: false,
      }),
    ).toBe('settled-back');
    expect(
      landscapeTickerEmphasis({
        phase: 'settled',
        frontMost: false,
        revealActive: true,
        reducedMotion: true,
      }),
    ).toBe('settled-back');
    expect(
      landscapeTickerEmphasis({
        phase: 'instant',
        frontMost: true,
        revealActive: true,
        reducedMotion: true,
      }),
    ).toBe('settled-front');
  });

  test('painted dominance excludes zero-point ids but keeps session order otherwise', () => {
    expect(
      paintedDominanceIds(['free_rapid', 'accl', 'free_blitz'], {
        free_rapid: 2,
        accl: 0,
        free_blitz: 3,
      }),
    ).toEqual(['free_rapid', 'free_blitz']);
    expect(paintedDominanceIds(['accl', 'tournament'], { accl: 0, tournament: 0 })).toEqual([]);
  });

  test('correctness lane does not depend on React Bits or chart zoom/pan', () => {
    const pkg = readFileSync(join(process.cwd(), 'package.json'), 'utf8');
    expect(pkg).not.toMatch(/react-bits|@react-bits|jsrepo/i);
    const hierarchy = readFileSync(
      join(process.cwd(), 'lib/profile/landscapeTickerHierarchy.ts'),
      'utf8',
    );
    expect(hierarchy).toContain('React Bits visual polish');
    expect(hierarchy).toContain('Chart-local zoom/pan');
    const chart = readFileSync(
      join(process.cwd(), 'components/profile/ratings/LandscapeRatingTickerChart.tsx'),
      'utf8',
    );
    expect(chart).not.toMatch(/from ['"]@?react-bits/i);
    expect(chart).not.toContain('onWheel');
    expect(chart).not.toContain('pinch');
  });
});
