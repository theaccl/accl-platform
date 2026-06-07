import { isLiveContinuityGame, isOpenSeatRow } from '@/lib/gameContinuityPresentation';
import {
  sortLobbyObligationRows,
  type LobbyObligationRow,
} from '@/lib/lobbyObligationPresentation';
import { platBucketForOpenSeat } from '@/lib/platOpenSeatBucket';
import { PLAT_MODE_LABELS } from '@/lib/freePlayModeTimeControl';
import { formatGameTimeControlLabel } from '@/lib/gameTimeControl';

/** Exact CTA copy — do not use "Return to board" / "Resume games" / "Go to your game". */
export const LIVE_GAME_RECOVERY_RETURN_LABEL = 'Return to live board';

/** "<Mode> <TC>" e.g. "Rapid 10M"; falls back to "Live 10M" when bucket unknown. */
export function liveRecoveryBoardLabel(
  row: Pick<LobbyObligationRow, 'tempo' | 'live_time_control'>,
): string {
  const bucket = platBucketForOpenSeat(row.tempo, row.live_time_control ?? null);
  const tc = String(row.live_time_control ?? '').trim();
  if (bucket && tc) return `${PLAT_MODE_LABELS[bucket]} ${tc.toUpperCase()}`;
  return formatGameTimeControlLabel(row.tempo, row.live_time_control ?? null);
}

function isActiveOrWaitingStatus(status: string | null | undefined): boolean {
  const s = String(status ?? '').trim().toLowerCase();
  return s === 'active' || s === 'waiting';
}

/**
 * Seated, active, human free-play live boards the user is in — presence-based
 * (visible regardless of whose move). Excludes open/waiting seats (a waiting seat is
 * not a live game), daily/async, tournament, and finished rows (filtered upstream by
 * `useLobbyUserObligations`, which queries only `play_context='free'`,
 * `tournament_id is null`, `status in ('active','waiting')`).
 */
export function selectSeatedLiveRecoveryRows(
  rows: LobbyObligationRow[] | null | undefined,
  uid: string | null,
): LobbyObligationRow[] {
  if (!uid) return [];
  const seated = (rows ?? []).filter((r) => {
    if (!isActiveOrWaitingStatus(r.status)) return false;
    if (!isLiveContinuityGame(r)) return false;
    if (isOpenSeatRow(r)) return false;
    return r.white_player_id === uid || r.black_player_id === uid;
  });
  return sortLobbyObligationRows(seated, uid);
}
