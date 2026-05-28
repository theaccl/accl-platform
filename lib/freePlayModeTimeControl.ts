/**
 * Free-play PLAT lobby: bridges UI + game creation to `lib/acclTimeControls.ts` (canonical).
 * Used by Free play queue UI + `runFreePlayCreateGame` / `runFreePlayFindMatchAutomatic` + Direct Challenge.
 */

import {
  allKnownPlatTokensForMode,
  freePlayOptionsForMode,
  type RatingMode,
} from '@/lib/acclTimeControls';
import { canonicalLiveTimeControlForInsert } from '@/lib/gameTimeControl';
import type { GameTempo } from '@/lib/gameTempo';

export type PlatMode = RatingMode;

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

function buildPlatModeTimeOptions(): Record<PlatMode, ReadonlyArray<{ id: PlatTimeControlId; label: string }>> {
  return {
    bullet: freePlayOptionsForMode('bullet'),
    blitz: freePlayOptionsForMode('blitz'),
    rapid: freePlayOptionsForMode('rapid'),
    daily: freePlayOptionsForMode('daily'),
  };
}

/** Official ACCL free-play clocks per mode (from registry). */
export const PLAT_MODE_TIME_OPTIONS: Record<
  PlatMode,
  readonly { id: PlatTimeControlId; label: string }[]
> = buildPlatModeTimeOptions();

export function platTimeOptionsForMode(mode: PlatMode): readonly { id: PlatTimeControlId; label: string }[] {
  return PLAT_MODE_TIME_OPTIONS[mode];
}

export function defaultPlatTimeControl(mode: PlatMode): PlatTimeControlId {
  const first = PLAT_MODE_TIME_OPTIONS[mode][0];
  return first ? first.id : '3m';
}

export function isValidPlatTimeForMode(mode: PlatMode, id: string): boolean {
  const s = String(id ?? '').trim();
  if (PLAT_MODE_TIME_OPTIONS[mode].some((o) => o.id === s)) return true;
  return allKnownPlatTokensForMode(mode).includes(s);
}

/** If current is illegal for `mode`, return the mode’s first official id. */
export function coercePlatTimeForMode(mode: PlatMode, current: string): PlatTimeControlId {
  if (PLAT_MODE_TIME_OPTIONS[mode].some((o) => o.id === String(current ?? '').trim())) {
    return String(current).trim();
  }
  return defaultPlatTimeControl(mode);
}

export function platModeLabel(mode: PlatMode): string {
  return PLAT_MODE_LABELS[mode] ?? mode;
}

/**
 * Maps PLAT mode + clock to `games` / `match_requests` tempo + live_time_control.
 * Bullet/blitz/rapid → `live`; daily → `daily` with 1d/2d/3d/7d.
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
