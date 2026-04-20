import {
  coercePlatTimeForMode,
  type PlatMode,
} from '@/lib/freePlayModeTimeControl';
import { platBucketForOpenSeat } from '@/lib/platOpenSeatBucket';
import { canonicalLiveTimeControlForInsert } from '@/lib/gameTimeControl';
import { normalizeGameTempo } from '@/lib/gameTempo';

export type FreeOpenSeatRow = {
  id: string;
  white_player_id: string;
  tempo: string | null;
  live_time_control: string | null;
  created_at?: string | null;
  rated?: boolean | null;
};

export function openSeatMatchesPlatMode(
  row: Pick<FreeOpenSeatRow, 'tempo' | 'live_time_control'>,
  mode: PlatMode,
): boolean {
  return platBucketForOpenSeat(row.tempo, row.live_time_control) === mode;
}

/** True when the open seat matches the selected PLAT clock for that mode (queue filter). */
export function openSeatMatchesPlatClock(
  row: Pick<FreeOpenSeatRow, 'tempo' | 'live_time_control'>,
  mode: PlatMode,
  clockId: string,
): boolean {
  if (!openSeatMatchesPlatMode(row, mode)) return false;
  const want = coercePlatTimeForMode(mode, clockId);
  const stored = String(row.live_time_control ?? '')
    .toLowerCase()
    .trim();
  const t = normalizeGameTempo(row.tempo);
  const canonicalWant =
    mode === 'daily' || t === 'daily'
      ? String(canonicalLiveTimeControlForInsert('daily', want) ?? want)
          .toLowerCase()
          .trim()
      : String(canonicalLiveTimeControlForInsert('live', want) ?? want)
          .toLowerCase()
          .trim();
  return stored === canonicalWant;
}

/** Match queue rated preference: `null` on legacy rows counts as unrated for filtering. */
export function openSeatMatchesRated(
  row: Pick<FreeOpenSeatRow, 'rated'>,
  wantRated: boolean,
): boolean {
  if (wantRated) {
    return row.rated === true;
  }
  return row.rated !== true;
}
