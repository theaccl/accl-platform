import { normalizeGameTempo } from '@/lib/gameTempo';

/** Live tournament boards only — before first move. */
export const LIVE_TOURNAMENT_FIRST_MOVE_GRACE_SEC = (() => {
  const raw = process.env.ACCL_TOURNAMENT_FIRST_MOVE_GRACE_SEC ?? process.env.NEXT_PUBLIC_TOURNAMENT_FIRST_MOVE_GRACE_SEC;
  const n = raw != null ? Number(raw) : NaN;
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  if (process.env.NODE_ENV === 'test') return 10;
  return 30;
})();

export const LIVE_TOURNAMENT_FIRST_MOVE_GRACE_MS = LIVE_TOURNAMENT_FIRST_MOVE_GRACE_SEC * 1000;

export const FIRST_MOVE_ABANDON_END_REASON = 'abandoned_before_move';

export type FirstMoveGraceGameRow = {
  play_context?: string | null;
  tournament_id?: string | null;
  tempo?: string | null;
  status?: string | null;
  white_player_id?: string | null;
  black_player_id?: string | null;
  turn?: string | null;
  created_at?: string | null;
};

export function isLiveTournamentBoard(row: FirstMoveGraceGameRow): boolean {
  if (String(row.play_context ?? '') !== 'tournament') return false;
  if (!String(row.tournament_id ?? '').trim()) return false;
  return normalizeGameTempo(row.tempo) === 'live';
}

export function bothSeatedForFirstMoveGrace(row: FirstMoveGraceGameRow): boolean {
  return Boolean(row.white_player_id && row.black_player_id);
}

export function firstMoveGraceAnchorMs(row: Pick<FirstMoveGraceGameRow, 'created_at'>): number {
  const t = Date.parse(String(row.created_at ?? ''));
  return Number.isFinite(t) ? t : Date.now();
}

export function firstMoveGraceDeadlineMs(row: Pick<FirstMoveGraceGameRow, 'created_at'>): number {
  return firstMoveGraceAnchorMs(row) + LIVE_TOURNAMENT_FIRST_MOVE_GRACE_MS;
}

export function firstMoveGraceRemainingMs(
  row: Pick<FirstMoveGraceGameRow, 'created_at'>,
  nowMs = Date.now(),
): number {
  return Math.max(0, firstMoveGraceDeadlineMs(row) - nowMs);
}

export function firstMoveGraceExpired(
  row: Pick<FirstMoveGraceGameRow, 'created_at'>,
  nowMs = Date.now(),
): boolean {
  return firstMoveGraceRemainingMs(row, nowMs) <= 0;
}

/** White must make move one in standard chess; 0 plies means white failed if grace expires. */
export function firstMoveGraceAbsenteeSide(
  _row: Pick<FirstMoveGraceGameRow, 'turn'>,
): 'white' | 'black' {
  return 'white';
}

export function firstMoveGraceFinishResult(absentee: 'white' | 'black'): 'white_win' | 'black_win' {
  return absentee === 'white' ? 'black_win' : 'white_win';
}

export function shouldShowFirstMoveGraceUi(input: {
  game: FirstMoveGraceGameRow;
  moveCount: number;
  gameStatus: string;
}): boolean {
  if (input.moveCount > 0) return false;
  if (String(input.gameStatus ?? '') === 'finished') return false;
  if (!isLiveTournamentBoard(input.game)) return false;
  if (!bothSeatedForFirstMoveGrace(input.game)) return false;
  return input.game.status === 'active' || input.game.status === 'waiting';
}
