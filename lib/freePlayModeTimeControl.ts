/**
 * Free-play PLAT lobby: single source of truth for mode ↔ legal time controls.
 * Used by Free play queue UI + `runFreePlayCreateGame` / `runFreePlayFindMatchAutomatic` + Direct Challenge inserts.
 */

import { canonicalLiveTimeControlForInsert } from '@/lib/gameTimeControl';
import type { GameTempo } from '@/lib/gameTempo';

export type PlatMode = 'bullet' | 'blitz' | 'rapid' | 'daily';

/** UI order for mode chips (matches free-play lobby). */
export const PLAT_MODE_ORDER: readonly PlatMode[] = ['bullet', 'blitz', 'rapid', 'daily'];

/** Stored on `games.live_time_control` (tempo live or daily as appropriate). */
export type PlatTimeControlId = string;

export const PLAT_MODE_LABELS: Record<PlatMode, string> = {
  bullet: 'Bullet',
  blitz: 'Blitz',
  rapid: 'Rapid',
  daily: 'Daily',
};

export const PLAT_MODE_TIME_OPTIONS: Record<PlatMode, readonly { id: PlatTimeControlId; label: string }[]> = {
  bullet: [
    { id: '1m', label: '1 min' },
    { id: '1+1', label: '1+1' },
    { id: '2+1', label: '2+1' },
  ],
  blitz: [
    { id: '3m', label: '3 min' },
    { id: '3+2', label: '3+2' },
    { id: '5m', label: '5 min' },
    { id: '5+5', label: '5+5' },
  ],
  rapid: [
    { id: '10m', label: '10 min' },
    { id: '15m', label: '15 min' },
    { id: '20m', label: '20 min' },
    { id: '30m', label: '30 min' },
    { id: '60m', label: '60 min' },
  ],
  daily: [
    { id: '1d', label: '1 day' },
    { id: '2d', label: '2 day' },
    { id: '3d', label: '3 day' },
  ],
};

export function platTimeOptionsForMode(mode: PlatMode): readonly { id: PlatTimeControlId; label: string }[] {
  return PLAT_MODE_TIME_OPTIONS[mode];
}

export function defaultPlatTimeControl(mode: PlatMode): PlatTimeControlId {
  const first = PLAT_MODE_TIME_OPTIONS[mode][0];
  return first ? first.id : '3m';
}

export function isValidPlatTimeForMode(mode: PlatMode, id: string): boolean {
  const s = String(id ?? '').trim();
  return PLAT_MODE_TIME_OPTIONS[mode].some((o) => o.id === s);
}

/** If current is illegal for `mode`, return the mode’s first legal id. */
export function coercePlatTimeForMode(mode: PlatMode, current: string): PlatTimeControlId {
  if (isValidPlatTimeForMode(mode, current)) return String(current).trim();
  return defaultPlatTimeControl(mode);
}

export function platModeLabel(mode: PlatMode): string {
  return PLAT_MODE_LABELS[mode] ?? mode;
}

/**
 * Maps PLAT mode + clock to `games` / `match_requests` tempo + live_time_control.
 * Bullet/blitz/rapid → `live`; daily → `daily` with 1d/2d/3d.
 */
export function platSelectionToStoredGameFields(mode: PlatMode, clock: string): {
  tempo: GameTempo;
  live_time_control: string;
} {
  const tc = coercePlatTimeForMode(mode, clock);
  if (!isValidPlatTimeForMode(mode, tc)) {
    throw new Error('Invalid mode and time control combination.');
  }
  const tempo: GameTempo = mode === 'daily' ? 'daily' : 'live';
  const live_time_control = canonicalLiveTimeControlForInsert(tempo, tc) ?? tc;
  return { tempo, live_time_control };
}
