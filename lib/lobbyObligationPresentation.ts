import type { GameContinuityRow } from '@/lib/gameContinuityPresentation';

export const YOUR_MOVE_SECTION_TITLE = 'Your move';
export const TOURNAMENT_LIVE_SECTION_TITLE = 'Tournament — Your Move / Live';
export const TOURNAMENT_LIVE_SECTION_HINT =
  'Your match ready — bracket boards dominate free-play queues; you will be routed to your board or event hub while live.';
export const FREE_LIVE_SECTION_TITLE = 'Free play — Live recovery';
export const FREE_LIVE_RECOVERY_HINT =
  'Your active live board shows as a sticky banner above and stays live on both clocks. Open live seats you posted are listed here.';
export const DAILY_ASYNC_YOUR_MOVE_TITLE = 'Daily / Async — Your Move';

export type LobbyObligationRow = GameContinuityRow & {
  tournament_id?: string | null;
  white_clock_ms?: number | null;
  black_clock_ms?: number | null;
};

export function isLobbyYourMove(row: Pick<LobbyObligationRow, 'turn' | 'white_player_id' | 'black_player_id'>, uid: string): boolean {
  const t = String(row.turn ?? '').trim().toLowerCase();
  if (t !== 'white' && t !== 'black') return false;
  if (!row.black_player_id) return false;
  if (t === 'white' && row.white_player_id === uid) return true;
  if (t === 'black' && row.black_player_id === uid) return true;
  return false;
}

/** Side to move clock remaining (ms), when clocks are stored. */
export function clockRemainingMsForUser(row: LobbyObligationRow, uid: string): number | null {
  const t = String(row.turn ?? '').trim().toLowerCase();
  if (t === 'white' && row.white_player_id === uid) {
    return Number.isFinite(row.white_clock_ms) ? Number(row.white_clock_ms) : null;
  }
  if (t === 'black' && row.black_player_id === uid) {
    return Number.isFinite(row.black_clock_ms) ? Number(row.black_clock_ms) : null;
  }
  return null;
}

/** Urgency: your turn first, then lowest remaining clock, then oldest `updated_at`. */
export function sortLobbyObligationRows<T extends LobbyObligationRow>(rows: T[], uid: string | null): T[] {
  if (!uid) return [...rows];
  return [...rows].sort((a, b) => {
    const aMove = isLobbyYourMove(a, uid);
    const bMove = isLobbyYourMove(b, uid);
    if (aMove !== bMove) return aMove ? -1 : 1;

    const aClock = clockRemainingMsForUser(a, uid);
    const bClock = clockRemainingMsForUser(b, uid);
    if (aClock != null && bClock != null && aClock !== bClock) return aClock - bClock;
    if (aClock != null && bClock == null) return -1;
    if (aClock == null && bClock != null) return 1;

    const aUp = Date.parse(String(a.updated_at ?? '')) || 0;
    const bUp = Date.parse(String(b.updated_at ?? '')) || 0;
    return aUp - bUp;
  });
}

export function isTournamentObligationRow(row: LobbyObligationRow): boolean {
  return Boolean(row.tournament_id);
}
