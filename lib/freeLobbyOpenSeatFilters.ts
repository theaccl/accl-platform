import { isKnownBotHostUserId } from '@/lib/bot/botIdentity';
import {
  openSeatMatchesPlatClock,
  openSeatMatchesPlatMode,
  openSeatMatchesRated,
  type FreeOpenSeatRow,
} from '@/lib/freePlayOpenSeatsFilter';
import { PLAT_MODE_LABELS, type PlatMode } from '@/lib/freePlayModeTimeControl';
import { rowIndicatesLiveFreePlayPacing } from '@/lib/freePlayLiveSession';
import { openSeatRowHostSeatedConflictsInSameSlot } from '@/lib/freePlayQueueSlotConflict';
import { platBucketForOpenSeat } from '@/lib/platOpenSeatBucket';
import type { GameContinuityRow } from '@/lib/gameContinuityPresentation';

/** Lobby games row shape used for public open-seat filtering (counts + lists). */
export type PublicOpenSeatLobbyRow = FreeOpenSeatRow & {
  white_player_id: string;
  black_player_id?: string | null;
  status?: string | null;
  play_context?: string | null;
  tournament_id?: string | null;
};

export type PublicOpenSeatSeatedRow = {
  id: string;
  white_player_id: string;
  black_player_id: string | null;
  tempo: string | null;
  live_time_control: string | null;
  rated: boolean | null;
  status?: string | null;
};

/** Bot-hosted unmatched open seats are not public queue inventory. */
export function isBotHostedPublicOpenSeat(
  row: Pick<PublicOpenSeatLobbyRow, 'white_player_id'>,
): boolean {
  return isKnownBotHostUserId(row.white_player_id);
}

/** Valid public unmatched live open seat before mode/lane/busy filters. */
export function isPublicUnmatchedLiveOpenSeatRow(
  row: Pick<
    PublicOpenSeatLobbyRow,
    'black_player_id' | 'status' | 'tempo' | 'live_time_control' | 'play_context' | 'tournament_id'
  >,
): boolean {
  if (String(row.play_context ?? 'free') !== 'free') return false;
  if (row.tournament_id) return false;
  if (row.black_player_id) return false;
  if (String(row.status ?? 'active').toLowerCase() !== 'active') return false;
  return rowIndicatesLiveFreePlayPacing(row);
}

export function partitionLobbyRowsForPublicOpen<
  T extends PublicOpenSeatLobbyRow & { black_player_id: string | null; status?: string | null },
>(
  rows: T[],
): { openCandidates: T[]; seatedForBusy: PublicOpenSeatSeatedRow[] } {
  const openCandidates: T[] = [];
  const seatedForBusy: PublicOpenSeatSeatedRow[] = [];
  for (const r of rows) {
    if (r.black_player_id) {
      seatedForBusy.push({
        id: r.id,
        white_player_id: r.white_player_id,
        black_player_id: r.black_player_id,
        tempo: r.tempo,
        live_time_control: r.live_time_control,
        rated: r.rated ?? null,
        status: r.status ?? null,
      });
      continue;
    }
    if (isPublicUnmatchedLiveOpenSeatRow(r)) {
      openCandidates.push(r);
    }
  }
  return { openCandidates, seatedForBusy };
}

/**
 * Public Open Games inventory: live unmatched seats in optional mode scope,
 * excluding bot hosts and host-busy conflicts.
 */
export function filterPublicVisibleOpenSeats<T extends PublicOpenSeatLobbyRow>(
  openCandidates: T[],
  seatedForBusy: PublicOpenSeatSeatedRow[],
  mode?: PlatMode,
): T[] {
  return openCandidates.filter((r) => {
    if (isBotHostedPublicOpenSeat(r)) return false;
    if (mode != null && !openSeatMatchesPlatMode(r, mode)) return false;
    return !seatedForBusy.some((g) => openSeatRowHostSeatedConflictsInSameSlot(r, g));
  });
}

/** Count visible rows for selected clock + lane (parity with Open Games list). */
export function countVisiblePublicOpenSeatsForSlice(
  rows: PublicOpenSeatLobbyRow[],
  mode: PlatMode,
  clockId: string,
  selectedRated: boolean,
): number {
  return rows.filter(
    (r) =>
      openSeatMatchesPlatClock(r, mode, clockId) && openSeatMatchesRated(r, selectedRated),
  ).length;
}

/** `{Mode} {TC} · {Rated|Unrated}` for waiting-seat surfaces. */
export function openSeatExactControlDisplayLabel(
  row: Pick<GameContinuityRow, 'tempo' | 'live_time_control' | 'rated'>,
): string {
  const bucket = platBucketForOpenSeat(row.tempo, row.live_time_control ?? null);
  const modeLabel = bucket ? PLAT_MODE_LABELS[bucket] : 'Live';
  const tc = String(row.live_time_control ?? '')
    .trim()
    .toUpperCase();
  const lane = row.rated === true ? 'Rated' : 'Unrated';
  return `${modeLabel} ${tc || '—'} · ${lane}`;
}
