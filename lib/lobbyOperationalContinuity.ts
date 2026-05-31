import {
  isLiveContinuityGame,
  isOpenSeatRow,
  type GameContinuityRow,
} from '@/lib/gameContinuityPresentation';
import { isLobbyYourMove, type LobbyObligationRow } from '@/lib/lobbyObligationPresentation';
import {
  emptyPlatModeCounts,
  platModeForLobbyRow,
  type LobbyHubModeFilter,
} from '@/lib/lobbyModeFilter';
import type { PlatMode } from '@/lib/freePlayModeTimeControl';

/**
 * Live free-play rows that belong in hub obligations (recovery), not passive parking.
 *
 * Presence-based for seated boards: a seated live game the user is in is an active
 * obligation while in play, **regardless of whose move it is** — the clock keeps
 * running while the opponent thinks, so the board must not disappear on the
 * opponent's turn. Open seats remain host-only. Daily/async and finished rows are
 * excluded upstream (live partition only).
 */
export function isLiveFreeRecoveryObligation(
  row: Pick<GameContinuityRow, 'tempo' | 'live_time_control' | 'turn' | 'white_player_id' | 'black_player_id'>,
  uid: string | null,
): boolean {
  if (!uid || !isLiveContinuityGame(row)) return false;
  if (isOpenSeatRow(row)) return row.white_player_id === uid;
  return row.white_player_id === uid || row.black_player_id === uid;
}

/** All Modes overview shows every subsection; filtered lanes hide empty shells. */
export function shouldRenderLobbyObligationSubsection(
  modeFilter: LobbyHubModeFilter,
  rowCount: number,
  loading: boolean,
): boolean {
  if (!modeFilter) return true;
  if (loading) return false;
  return rowCount > 0;
}

/** Hub mode-zone pulse: my tournament seats, live recovery, async your-move. */
export function isHubOperationalObligation(row: LobbyObligationRow, uid: string | null): boolean {
  if (!uid) return false;
  if (row.tournament_id) {
    return row.white_player_id === uid || row.black_player_id === uid;
  }
  if (isLiveContinuityGame(row)) return isLiveFreeRecoveryObligation(row, uid);
  return isLobbyYourMove(row, uid);
}

/** User-hosted unmatched live open seat (waiting for opponent) — hub badge only, not "your move". */
export function isOwnUnmatchedOpenLiveSeat(
  row: Pick<GameContinuityRow, 'tempo' | 'live_time_control' | 'white_player_id' | 'black_player_id'>,
  uid: string | null,
): boolean {
  if (!uid) return false;
  return isLiveContinuityGame(row) && isOpenSeatRow(row) && row.white_player_id === uid;
}

export function countOwnOpenLiveSeatsByPlatMode(
  rows: LobbyObligationRow[],
  uid: string | null,
): Record<PlatMode, number> {
  const out = emptyPlatModeCounts();
  if (!uid) return out;
  for (const row of rows) {
    if (!isOwnUnmatchedOpenLiveSeat(row, uid)) continue;
    const m = platModeForLobbyRow(row);
    if (m) out[m] += 1;
  }
  return out;
}

export function countHubObligationByPlatMode(
  rows: LobbyObligationRow[],
  uid: string | null,
): Record<PlatMode, number> {
  const out = emptyPlatModeCounts();
  if (!uid) return out;
  for (const row of rows) {
    if (!isHubOperationalObligation(row, uid)) continue;
    const m = platModeForLobbyRow(row);
    if (m) out[m] += 1;
  }
  return out;
}

/** Exploration feeds (spectator / open pairing) follow the same filtered visibility rule. */
export function shouldRenderLobbyExplorationSection(
  modeFilter: LobbyHubModeFilter,
  hasMatchingData: boolean,
  loading: boolean,
): boolean {
  if (!modeFilter) return true;
  if (loading) return false;
  return hasMatchingData;
}
