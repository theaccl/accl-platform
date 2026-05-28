/**
 * Canonical ACCL time-control registry for Profile rating tracks, labels, and future expansion.
 * Profile ticker uses `displayValue` / `displayLabel`; PLAT lobby uses `platToken` when set.
 * Badge settlement uses `badgeTrackKey` (must stay aligned with SQL `classify_free_badge_track_key`).
 */

import type { FreeBadgeTrackKey } from '@/lib/badgeTracks';

export type RatingMode = 'bullet' | 'blitz' | 'rapid' | 'daily';

export type TimeControlDefinition = {
  id: string;
  mode: RatingMode;
  label: string;
  displayLabel: string;
  ratingTrackId: string;
  badgeTrackKey: FreeBadgeTrackKey | null;
  /** Stored on `games.live_time_control` when offered in PLAT. */
  platToken: string | null;
  normalizedValue: string;
  displayValue: string;
  baseMinutes?: number;
  incrementSeconds?: number;
  daysPerMove?: number;
  isActive: boolean;
  isVisible: boolean;
  ratingEligible: boolean;
  freePlayEligible: boolean;
  tournamentEligible: boolean;
  isAsync: boolean;
  sortOrder: number;
};

export const ACCL_TIME_CONTROLS: readonly TimeControlDefinition[] = [
  {
    id: 'bullet_1_0',
    mode: 'bullet',
    label: '1+0',
    displayLabel: 'Bullet 1+0',
    ratingTrackId: 'free_bullet_1_0',
    badgeTrackKey: 'bullet_1_0',
    platToken: '1m',
    normalizedValue: '1+0',
    displayValue: '1+0',
    baseMinutes: 1,
    incrementSeconds: 0,
    isActive: true,
    isVisible: true,
    ratingEligible: true,
    freePlayEligible: true,
    tournamentEligible: true,
    isAsync: false,
    sortOrder: 10,
  },
  {
    id: 'bullet_1_1',
    mode: 'bullet',
    label: '1+1',
    displayLabel: 'Bullet 1+1',
    ratingTrackId: 'free_bullet_1_1',
    badgeTrackKey: 'bullet_1_1',
    platToken: '1+1',
    normalizedValue: '1+1',
    displayValue: '1+1',
    baseMinutes: 1,
    incrementSeconds: 1,
    isActive: true,
    isVisible: true,
    ratingEligible: true,
    freePlayEligible: true,
    tournamentEligible: true,
    isAsync: false,
    sortOrder: 20,
  },
  {
    id: 'bullet_2_0',
    mode: 'bullet',
    label: '2',
    displayLabel: 'Bullet 2',
    ratingTrackId: 'free_bullet_2_0',
    badgeTrackKey: 'bullet_2_0',
    platToken: '2m',
    normalizedValue: '2+0',
    displayValue: '2',
    baseMinutes: 2,
    incrementSeconds: 0,
    isActive: true,
    isVisible: true,
    ratingEligible: true,
    freePlayEligible: true,
    tournamentEligible: true,
    isAsync: false,
    sortOrder: 30,
  },
  {
    id: 'bullet_2_1',
    mode: 'bullet',
    label: '2+1',
    displayLabel: 'Bullet 2+1',
    ratingTrackId: 'free_bullet_2_1',
    badgeTrackKey: 'bullet_2_1',
    platToken: '2+1',
    normalizedValue: '2+1',
    displayValue: '2+1',
    baseMinutes: 2,
    incrementSeconds: 1,
    isActive: true,
    isVisible: true,
    ratingEligible: true,
    freePlayEligible: true,
    tournamentEligible: true,
    isAsync: false,
    sortOrder: 40,
  },
  {
    id: 'blitz_3_0',
    mode: 'blitz',
    label: '3+0',
    displayLabel: 'Blitz 3+0',
    ratingTrackId: 'free_blitz_3_0',
    badgeTrackKey: 'blitz_3_0',
    platToken: '3m',
    normalizedValue: '3+0',
    displayValue: '3+0',
    baseMinutes: 3,
    incrementSeconds: 0,
    isActive: true,
    isVisible: true,
    ratingEligible: true,
    freePlayEligible: true,
    tournamentEligible: true,
    isAsync: false,
    sortOrder: 110,
  },
  {
    id: 'blitz_3_2',
    mode: 'blitz',
    label: '3+2',
    displayLabel: 'Blitz 3+2',
    ratingTrackId: 'free_blitz_3_2',
    badgeTrackKey: 'blitz_3_2',
    platToken: '3+2',
    normalizedValue: '3+2',
    displayValue: '3+2',
    baseMinutes: 3,
    incrementSeconds: 2,
    isActive: true,
    isVisible: true,
    ratingEligible: true,
    freePlayEligible: true,
    tournamentEligible: true,
    isAsync: false,
    sortOrder: 120,
  },
  {
    id: 'blitz_5_0',
    mode: 'blitz',
    label: '5+0',
    displayLabel: 'Blitz 5+0',
    ratingTrackId: 'free_blitz_5_0',
    badgeTrackKey: 'blitz_5_0',
    platToken: '5m',
    normalizedValue: '5+0',
    displayValue: '5+0',
    baseMinutes: 5,
    incrementSeconds: 0,
    isActive: true,
    isVisible: true,
    ratingEligible: true,
    freePlayEligible: true,
    tournamentEligible: true,
    isAsync: false,
    sortOrder: 130,
  },
  {
    id: 'blitz_5_5',
    mode: 'blitz',
    label: '5+5',
    displayLabel: 'Blitz 5+5',
    ratingTrackId: 'free_blitz_5_5',
    badgeTrackKey: 'blitz_5_5',
    platToken: '5+5',
    normalizedValue: '5+5',
    displayValue: '5+5',
    baseMinutes: 5,
    incrementSeconds: 5,
    isActive: true,
    isVisible: true,
    ratingEligible: true,
    freePlayEligible: true,
    tournamentEligible: true,
    isAsync: false,
    sortOrder: 140,
  },
  {
    id: 'rapid_10_0',
    mode: 'rapid',
    label: '10',
    displayLabel: 'Rapid 10',
    ratingTrackId: 'free_rapid_10_0',
    badgeTrackKey: 'rapid_10_0',
    platToken: '10m',
    normalizedValue: '10+0',
    displayValue: '10',
    baseMinutes: 10,
    incrementSeconds: 0,
    isActive: true,
    isVisible: true,
    ratingEligible: true,
    freePlayEligible: true,
    tournamentEligible: true,
    isAsync: false,
    sortOrder: 210,
  },
  {
    id: 'rapid_15_0',
    mode: 'rapid',
    label: '15',
    displayLabel: 'Rapid 15',
    ratingTrackId: 'free_rapid_15_0',
    badgeTrackKey: 'rapid_15_0',
    platToken: '15m',
    normalizedValue: '15+0',
    displayValue: '15',
    baseMinutes: 15,
    incrementSeconds: 0,
    isActive: true,
    isVisible: true,
    ratingEligible: true,
    freePlayEligible: true,
    tournamentEligible: true,
    isAsync: false,
    sortOrder: 220,
  },
  {
    id: 'rapid_30_0',
    mode: 'rapid',
    label: '30',
    displayLabel: 'Rapid 30',
    ratingTrackId: 'free_rapid_30_0',
    badgeTrackKey: 'rapid_30_0',
    platToken: '30m',
    normalizedValue: '30+0',
    displayValue: '30',
    baseMinutes: 30,
    incrementSeconds: 0,
    isActive: true,
    isVisible: true,
    ratingEligible: true,
    freePlayEligible: true,
    tournamentEligible: true,
    isAsync: false,
    sortOrder: 230,
  },
  {
    id: 'rapid_60_0',
    mode: 'rapid',
    label: '60',
    displayLabel: 'Rapid 60',
    ratingTrackId: 'free_rapid_60_0',
    badgeTrackKey: 'rapid_60_0',
    platToken: '60m',
    normalizedValue: '60+0',
    displayValue: '60',
    baseMinutes: 60,
    incrementSeconds: 0,
    isActive: true,
    isVisible: true,
    ratingEligible: true,
    freePlayEligible: true,
    tournamentEligible: true,
    isAsync: false,
    sortOrder: 240,
  },
  {
    id: 'daily_1d',
    mode: 'daily',
    label: '1 day',
    displayLabel: 'Daily 1 day',
    ratingTrackId: 'free_daily_1d',
    badgeTrackKey: 'daily_1_day',
    platToken: '1d',
    normalizedValue: '1d',
    displayValue: '1 day',
    daysPerMove: 1,
    isActive: true,
    isVisible: true,
    ratingEligible: true,
    freePlayEligible: true,
    tournamentEligible: true,
    isAsync: true,
    sortOrder: 310,
  },
  {
    id: 'daily_2d',
    mode: 'daily',
    label: '2 days',
    displayLabel: 'Daily 2 days',
    ratingTrackId: 'free_daily_2d',
    badgeTrackKey: 'daily_2_day',
    platToken: '2d',
    normalizedValue: '2d',
    displayValue: '2 days',
    daysPerMove: 2,
    isActive: true,
    isVisible: true,
    ratingEligible: true,
    freePlayEligible: true,
    tournamentEligible: true,
    isAsync: true,
    sortOrder: 320,
  },
  {
    id: 'daily_3d',
    mode: 'daily',
    label: '3 days',
    displayLabel: 'Daily 3 days',
    ratingTrackId: 'free_daily_3d',
    badgeTrackKey: 'daily_3_day',
    platToken: '3d',
    normalizedValue: '3d',
    displayValue: '3 days',
    daysPerMove: 3,
    isActive: true,
    isVisible: true,
    ratingEligible: true,
    freePlayEligible: true,
    tournamentEligible: true,
    isAsync: true,
    sortOrder: 330,
  },
  {
    id: 'daily_7d',
    mode: 'daily',
    label: '7 days',
    displayLabel: 'Daily 7 days',
    ratingTrackId: 'free_daily_7d',
    badgeTrackKey: 'daily_7_day',
    platToken: '7d',
    normalizedValue: '7d',
    displayValue: '7 days',
    daysPerMove: 7,
    isActive: true,
    isVisible: true,
    ratingEligible: true,
    freePlayEligible: true,
    tournamentEligible: true,
    isAsync: true,
    sortOrder: 340,
  },
  /** Legacy PLAT rapid — hidden from Profile ticker grid but kept for classification parity. */
  {
    id: 'rapid_20_0',
    mode: 'rapid',
    label: '20',
    displayLabel: 'Rapid 20',
    ratingTrackId: 'free_rapid_20_0',
    badgeTrackKey: 'rapid_20_0',
    platToken: '20m',
    normalizedValue: '20+0',
    displayValue: '20',
    baseMinutes: 20,
    incrementSeconds: 0,
    isActive: false,
    isVisible: false,
    ratingEligible: true,
    freePlayEligible: false,
    tournamentEligible: false,
    isAsync: false,
    sortOrder: 225,
  },
  /** Legacy daily pace in badge SQL — not in locked Profile ticker list. */
  {
    id: 'daily_5d',
    mode: 'daily',
    label: '5 days',
    displayLabel: 'Daily 5 days',
    ratingTrackId: 'free_daily_5d',
    badgeTrackKey: 'daily_5_day',
    platToken: '5d',
    normalizedValue: '5d',
    displayValue: '5 days',
    daysPerMove: 5,
    isActive: false,
    isVisible: false,
    ratingEligible: true,
    freePlayEligible: false,
    tournamentEligible: false,
    isAsync: true,
    sortOrder: 335,
  },
] as const;

export function visibleTimeControlsForMode(mode: RatingMode): TimeControlDefinition[] {
  return ACCL_TIME_CONTROLS.filter((t) => t.mode === mode && t.isVisible);
}

export function timeControlByRatingTrackId(ratingTrackId: string): TimeControlDefinition | undefined {
  return ACCL_TIME_CONTROLS.find((t) => t.ratingTrackId === ratingTrackId);
}

export function timeControlByBadgeTrackKey(key: string): TimeControlDefinition | undefined {
  return ACCL_TIME_CONTROLS.find((t) => t.badgeTrackKey === key);
}

export function modeOverallRatingTrackId(mode: RatingMode): string {
  return `free_${mode === 'daily' ? 'day' : mode}`;
}

/** Free-play PLAT lobby label (clean no-increment: `2`, `10`, not `2+0` / `10+0`). */
export function platLobbyLabel(def: TimeControlDefinition): string {
  if (def.mode === 'daily') return def.displayValue;
  return def.label;
}

/** Official free-play options for a mode (registry-driven). */
export function freePlayOptionsForMode(
  mode: RatingMode,
): ReadonlyArray<{ id: string; label: string }> {
  return visibleTimeControlsForMode(mode)
    .filter((t) => t.freePlayEligible && t.platToken)
    .map((t) => ({
      id: t.platToken as string,
      label: platLobbyLabel(t),
    }));
}

/** All PLAT tokens still valid on existing rows (official + hidden legacy). */
export function allKnownPlatTokensForMode(mode: RatingMode): readonly string[] {
  const ids = new Set<string>();
  for (const t of ACCL_TIME_CONTROLS) {
    if (t.mode === mode && t.platToken) ids.add(t.platToken);
  }
  return [...ids];
}
