import {
  openSeatMatchesPlatClock,
  openSeatMatchesPlatMode,
  type FreeOpenSeatRow,
} from '@/lib/freePlayOpenSeatsFilter';
import { platTimeOptionsForMode, type PlatMode } from '@/lib/freePlayModeTimeControl';
import { canonicalLiveTimeControlForInsert } from '@/lib/gameTimeControl';
import type { FreePlayWatchListRow } from '@/lib/server/freePlayWatchList';

export function emptyClockCountsForMode(mode: PlatMode): Record<string, number> {
  return Object.fromEntries(platTimeOptionsForMode(mode).map((o) => [o.id, 0]));
}

/** Map API watch row canonical key → PLAT clock id for this mode. */
export function platClockIdFromWatchKey(mode: PlatMode, liveTimeControlKey: string): string | null {
  const key = String(liveTimeControlKey ?? '')
    .trim()
    .toLowerCase();
  if (!key) return null;
  for (const opt of platTimeOptionsForMode(mode)) {
    const tempo = mode === 'daily' ? 'daily' : 'live';
    const canonical = String(canonicalLiveTimeControlForInsert(tempo, opt.id) ?? opt.id)
      .toLowerCase()
      .trim();
    if (canonical === key) return opt.id;
  }
  return null;
}

/** Count open seats per PLAT clock in a mode (all rated slices). */
export function countOpenSeatsByClock(
  mode: PlatMode,
  rows: Pick<FreeOpenSeatRow, 'tempo' | 'live_time_control'>[],
): Record<string, number> {
  const counts = emptyClockCountsForMode(mode);
  for (const row of rows) {
    if (!openSeatMatchesPlatMode(row, mode)) continue;
    for (const opt of platTimeOptionsForMode(mode)) {
      if (openSeatMatchesPlatClock(row, mode, opt.id)) {
        counts[opt.id] = (counts[opt.id] ?? 0) + 1;
        break;
      }
    }
  }
  return counts;
}

/** Count live watch rows per PLAT clock in a mode. */
export function countWatchRowsByClock(
  mode: PlatMode,
  rows: Pick<FreePlayWatchListRow, 'liveTimeControlKey'>[],
): Record<string, number> {
  const counts = emptyClockCountsForMode(mode);
  for (const row of rows) {
    const id = platClockIdFromWatchKey(mode, row.liveTimeControlKey);
    if (id) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

export function formatModeRoomOpenClockTile(clockLabel: string, count: number): string {
  return `${clockLabel} · ${count} open`;
}

export function formatModeRoomWatchClockTile(clockLabel: string, count: number): string {
  return `${clockLabel} · ${count} live`;
}
