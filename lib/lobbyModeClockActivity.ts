import {
  openSeatMatchesPlatClock,
  openSeatMatchesPlatMode,
  type FreeOpenSeatRow,
} from '@/lib/freePlayOpenSeatsFilter';
import { platTimeOptionsForMode, type PlatMode } from '@/lib/freePlayModeTimeControl';
import { canonicalLiveTimeControlForInsert } from '@/lib/gameTimeControl';
import type { FreePlayWatchListRow } from '@/lib/server/freePlayWatchList';

export type OpenSeatClockLaneCounts = {
  rated: number;
  unrated: number;
  total: number;
};

export function emptyClockLaneCountsForMode(mode: PlatMode): Record<string, OpenSeatClockLaneCounts> {
  return Object.fromEntries(
    platTimeOptionsForMode(mode).map((o) => [o.id, { rated: 0, unrated: 0, total: 0 }]),
  );
}

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

/** Count public open seats per PLAT clock and rated lane in a mode. */
export function countOpenSeatsByClockAndLane(
  mode: PlatMode,
  rows: Pick<FreeOpenSeatRow, 'tempo' | 'live_time_control' | 'rated'>[],
): Record<string, OpenSeatClockLaneCounts> {
  const counts = emptyClockLaneCountsForMode(mode);
  for (const row of rows) {
    if (!openSeatMatchesPlatMode(row, mode)) continue;
    for (const opt of platTimeOptionsForMode(mode)) {
      if (openSeatMatchesPlatClock(row, mode, opt.id)) {
        const bucket = counts[opt.id]!;
        if (row.rated === true) {
          bucket.rated += 1;
        } else {
          bucket.unrated += 1;
        }
        bucket.total += 1;
        break;
      }
    }
  }
  return counts;
}

/** Mode-level totals per clock (sum of rated + unrated lanes). */
export function countOpenSeatsByClock(
  mode: PlatMode,
  rows: Pick<FreeOpenSeatRow, 'tempo' | 'live_time_control' | 'rated'>[],
): Record<string, number> {
  const laneCounts = countOpenSeatsByClockAndLane(mode, rows);
  const counts = emptyClockCountsForMode(mode);
  for (const [id, lanes] of Object.entries(laneCounts)) {
    counts[id] = lanes.total;
  }
  return counts;
}

export type ModeRoomOpenClockTilePresentation = {
  headline: string;
  sublines: string[];
  compactDetail: string;
  lit: boolean;
};

/** Compact mode-room open clock tile copy (lane-aware). */
export function formatModeRoomOpenClockTile(
  clockLabel: string,
  lanes: OpenSeatClockLaneCounts,
): ModeRoomOpenClockTilePresentation {
  const { rated, unrated, total } = lanes;
  if (total === 0) {
    const compactDetail = `${clockLabel} · no open seats`;
    return {
      headline: clockLabel,
      sublines: ['no open seats'],
      compactDetail,
      lit: false,
    };
  }
  if (rated > 0 && unrated > 0) {
    return {
      headline: clockLabel,
      sublines: [`Rated — ${rated} open`, `Unrated — ${unrated} open`],
      compactDetail: `${clockLabel}: Rated ${rated}, Unrated ${unrated}`,
      lit: true,
    };
  }
  const lane = rated > 0 ? 'Rated' : 'Unrated';
  const n = rated > 0 ? rated : unrated;
  const compactDetail = `${clockLabel} · ${lane} — ${n} open`;
  return {
    headline: clockLabel,
    sublines: [compactDetail.replace(`${clockLabel} · `, '')],
    compactDetail,
    lit: true,
  };
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

export function formatModeRoomWatchClockTile(clockLabel: string, count: number): string {
  return `${clockLabel} · ${count} live`;
}
