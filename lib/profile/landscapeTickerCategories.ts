/**
 * Expanded landscape ticker category registry (Free Play families only).
 * Isolated from Stage 2 compare-major-ratings so compact comparison stays unchanged.
 */

export type LandscapeTickerCategoryId =
  | 'accl'
  | 'tournament'
  | 'free_bullet'
  | 'free_blitz'
  | 'free_rapid'
  | 'free_day';

export type LandscapeTickerCategoryDef = {
  id: LandscapeTickerCategoryId;
  trackId: LandscapeTickerCategoryId;
  label: string;
  /** Distinct stroke color; controls also expose the label so state is not color-only. */
  color: string;
  testId: string;
};

export const LANDSCAPE_TICKER_CATEGORIES: readonly LandscapeTickerCategoryDef[] = [
  {
    id: 'accl',
    trackId: 'accl',
    label: 'Overall ACCL',
    color: '#34d399',
    testId: 'landscape-ticker-category-accl',
  },
  {
    id: 'tournament',
    trackId: 'tournament',
    label: 'Tournament',
    color: '#eab308',
    testId: 'landscape-ticker-category-tournament',
  },
  {
    id: 'free_bullet',
    trackId: 'free_bullet',
    label: 'Bullet',
    color: '#f472b6',
    testId: 'landscape-ticker-category-bullet',
  },
  {
    id: 'free_blitz',
    trackId: 'free_blitz',
    label: 'Blitz',
    color: '#fb923c',
    testId: 'landscape-ticker-category-blitz',
  },
  {
    id: 'free_rapid',
    trackId: 'free_rapid',
    label: 'Rapid',
    color: '#38bdf8',
    testId: 'landscape-ticker-category-rapid',
  },
  {
    id: 'free_day',
    trackId: 'free_day',
    label: 'Daily',
    color: '#a78bfa',
    testId: 'landscape-ticker-category-daily',
  },
] as const;

export function landscapeTickerCategoryById(
  id: LandscapeTickerCategoryId,
): LandscapeTickerCategoryDef {
  const found = LANDSCAPE_TICKER_CATEGORIES.find((c) => c.id === id);
  if (!found) {
    throw new Error(`Unknown landscape ticker category: ${id}`);
  }
  return found;
}

export function isLandscapeTickerCategoryId(value: string): value is LandscapeTickerCategoryId {
  return LANDSCAPE_TICKER_CATEGORIES.some((c) => c.id === value);
}
