/**
 * Restrained landscape-ticker stroke hierarchy.
 * Do not uniformly thicken every series — that crowds shared vertices.
 *
 * Later lanes (not this commit):
 * - React Bits visual polish after physical dominance correctness passes.
 * - Chart-local zoom/pan: in/out/reset, pinch-to-zoom and drag-to-pan inside
 *   the chart, fixed controls and Close, no overlay/background-page movement,
 *   accessible keyboard/button alternatives, bounded scale and recoverable reset.
 */

export type LandscapeTickerEmphasis =
  | 'hero'
  | 'quiet'
  | 'settled-front'
  | 'settled-back'
  | 'recessed';

export type LandscapeTickerStrokeStyle = {
  glow: number;
  core: number;
  casing: number;
  glowOpacity: number;
  coreOpacity: number;
  casingOpacity: number;
};

/** Near-black casing under the dominant core only. */
export const LANDSCAPE_TICKER_CASING_STROKE = '#070b10';

/** Recessed cores stay readable; do not solve fade with inaccessible contrast. */
export const LANDSCAPE_TICKER_RECESSED_MIN_CORE_OPACITY = 0.82;

/**
 * Older settled cores stay at or slightly under the previous 2.25px.
 * Only the front-most line gains modest extra core width plus casing.
 */
export function landscapeTickerStrokeStyle(
  emphasis: LandscapeTickerEmphasis,
): LandscapeTickerStrokeStyle {
  switch (emphasis) {
    case 'hero':
      return {
        glow: 7.5,
        core: 3.1,
        casing: 5.1,
        glowOpacity: 0.34,
        coreOpacity: 1,
        casingOpacity: 0.92,
      };
    case 'quiet':
      return {
        glow: 6.25,
        core: 2.85,
        casing: 4.6,
        glowOpacity: 0.3,
        coreOpacity: 0.98,
        casingOpacity: 0.9,
      };
    case 'settled-front':
      return {
        glow: 5.25,
        core: 2.75,
        casing: 4.35,
        glowOpacity: 0.26,
        coreOpacity: 0.98,
        casingOpacity: 0.88,
      };
    case 'settled-back':
      return {
        glow: 4.25,
        core: 2,
        casing: 0,
        glowOpacity: 0.2,
        coreOpacity: 0.88,
        casingOpacity: 0,
      };
    case 'recessed':
      return {
        glow: 4,
        core: 2,
        casing: 0,
        glowOpacity: 0.18,
        coreOpacity: LANDSCAPE_TICKER_RECESSED_MIN_CORE_OPACITY,
        casingOpacity: 0,
      };
  }
}

export function landscapeTickerEmphasis(input: {
  phase: 'hidden' | 'queued' | 'hero' | 'quiet' | 'instant' | 'settled';
  frontMost: boolean;
  revealActive: boolean;
  reducedMotion: boolean;
}): LandscapeTickerEmphasis {
  if (input.phase === 'hero') return 'hero';
  if (input.phase === 'quiet') return 'quiet';
  if (input.frontMost) return 'settled-front';
  if (input.revealActive && !input.reducedMotion) return 'recessed';
  return 'settled-back';
}

/**
 * Painted dominance excludes selected categories with no drawable points.
 * Session selection may still retain those ids.
 */
export function paintedDominanceIds(
  visibleOrder: readonly string[],
  pointCountById: Readonly<Record<string, number>>,
): string[] {
  return visibleOrder.filter((id) => (pointCountById[id] ?? 0) > 0);
}
