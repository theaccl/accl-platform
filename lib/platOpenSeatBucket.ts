import { normalizeGameTempo } from '@/lib/gameTempo';
import type { PlatMode } from '@/lib/freePlayModeTimeControl';

/**
 * Maps a waiting `games` row (open seat) to a PLAT bucket for lobby discovery.
 * Returns null if the row does not map to free-play PLAT modes.
 */
export function platBucketForOpenSeat(tempo: string | null, liveTimeControl: string | null): PlatMode | null {
  const t = normalizeGameTempo(tempo);
  const c = String(liveTimeControl ?? '')
    .toLowerCase()
    .trim();
  if (t === 'daily') {
    if (c === '1d' || c === '2d' || c === '3d') return 'daily';
    if (c === '30m' || c === '60m') return 'rapid';
    return 'daily';
  }
  if (t === 'correspondence') return null;
  if (t !== 'live') return null;
  if (c === '1m' || c === '1+1' || c === '2+1') return 'bullet';
  if (c === '3m' || c === '3+2' || c === '5m' || c === '5+5') return 'blitz';
  if (c === '10m' || c === '15m' || c === '20m' || c === '30m' || c === '60m') return 'rapid';
  return null;
}
