import type { RatingModeName } from '@/lib/profile/successfulPerformanceTypes';

/**
 * Frozen Route B exact-control evidence sets aligned with
 * public.get_own_successful_performance() — not derived from UI visibility flags.
 */
export const SUCCESSFUL_PERFORMANCE_ROUTE_B_CONTROLS: Readonly<
  Record<RatingModeName, readonly string[]>
> = {
  bullet: ['1+0', '1+1', '2+0', '2+1'],
  blitz: ['3+0', '3+2', '5+0', '5+5'],
  rapid: ['10+0', '15+0', '30+0', '60+0'],
  daily: ['1d', '2d', '3d', '7d'],
} as const;

export const SUCCESSFUL_PERFORMANCE_BROAD_MODES: readonly RatingModeName[] = [
  'bullet',
  'blitz',
  'rapid',
  'daily',
] as const;

/** Legacy / non-authoritative controls explicitly excluded from Route B evidence. */
export const SUCCESSFUL_PERFORMANCE_LEGACY_EXCLUDED_CONTROLS: readonly string[] = [
  '20+0',
  '5d',
] as const;

export const SUCCESSFUL_PERFORMANCE_BROAD_MODE_COLORS = ['white', 'black'] as const;

export type SuccessfulPerformanceBroadModeColor =
  (typeof SUCCESSFUL_PERFORMANCE_BROAD_MODE_COLORS)[number];
