import { PLAT_MODE_TIME_OPTIONS, type PlatMode } from '@/lib/freePlayModeTimeControl';
import { normalizeGameTempo } from '@/lib/gameTempo';

/** Daily / correspondence move pacing (not live clock). */
const DAILY_PACE_LTC = new Set(['1d', '2d', '3d']);

/** PLAT live clocks (bullet / blitz / rapid) + legacy token seen in DB. */
const LIVE_PLAT_LTC = new Set<string>(
  (['bullet', 'blitz', 'rapid'] as const).flatMap((m: PlatMode) =>
    PLAT_MODE_TIME_OPTIONS[m].map((o) => o.id.trim().toLowerCase())
  )
);
LIVE_PLAT_LTC.add('5m+3s');

export function liveTimeControlTokenIndicatesLivePacing(ltc: string | null | undefined): boolean {
  const s = String(ltc ?? '').trim().toLowerCase();
  if (!s) return false;
  if (DAILY_PACE_LTC.has(s)) return false;
  return LIVE_PLAT_LTC.has(s);
}

/**
 * True when a free-play row's pacing is "live" (bullet/blitz/rapid style), even if `tempo` was mis-stored.
 * Used for LIVE→LIVE accept blocks and live auto-follow.
 */
export function rowIndicatesLiveFreePlayPacing(row: {
  tempo?: string | null;
  live_time_control?: string | null;
}): boolean {
  return normalizeGameTempo(row.tempo) === 'live';
}
