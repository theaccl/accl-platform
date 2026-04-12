/**
 * Read-model helpers for tournament UI (no bracket / advancement logic).
 * Champion and final match are derived from stored match rows only.
 */

export type TournamentMatchSnapshot = {
  tournament_id: string;
  round_number: number;
  match_number: number;
  player1_id: string | null;
  player2_id: string | null;
  game_id: string | null;
  winner_id: string | null;
  next_match_id: string | null;
};

type MatchFinalProbe = {
  round_number: number;
  winner_id: string | null;
  next_match_id: string | null;
};

/**
 * Final match: terminal node in the bracket graph (no next_match_id).
 * When multiple exist, prefer the highest round_number (single-elim final).
 */
export function findFinalMatch<M extends MatchFinalProbe>(matches: M[]): M | null {
  const terminal = matches.filter((m) => m.next_match_id == null);
  if (terminal.length === 0) return null;
  return terminal.reduce((a, b) => (a.round_number >= b.round_number ? a : b));
}

/** Champion user id when tournament is completed and final match records a winner. */
export function championUserIdFromTournament<M extends MatchFinalProbe>(
  tournamentStatus: string,
  matches: M[]
): string | null {
  if (tournamentStatus !== 'completed') return null;
  const fin = findFinalMatch(matches);
  return fin?.winner_id ?? null;
}

export type MatchBoardStatus = 'waiting' | 'ready' | 'live' | 'resolved';

export function matchBoardStatus(
  m: Pick<
    TournamentMatchSnapshot,
    'player1_id' | 'player2_id' | 'winner_id' | 'game_id'
  >,
  gameRowStatus: string | null | undefined
): MatchBoardStatus {
  if (m.winner_id) return 'resolved';
  if (!m.player1_id || !m.player2_id) return 'waiting';
  if (!m.game_id) return 'ready';
  const gs = String(gameRowStatus ?? '').toLowerCase();
  if (gs === 'active' || gs === 'waiting') return 'live';
  if (gs === 'finished') return 'resolved';
  return 'live';
}

export function matchStatusLabel(board: MatchBoardStatus): string {
  switch (board) {
    case 'waiting':
      return 'Waiting (opponent TBD)';
    case 'ready':
      return 'Ready — board not spawned';
    case 'live':
      return 'In progress';
    case 'resolved':
      return 'Resolved';
    default:
      return board;
  }
}

/** Short label + palette for scan-friendly match status chips (read-model UI only). */
export function matchStatusPresentation(board: MatchBoardStatus): {
  short: string;
  title: string;
  border: string;
  background: string;
  color: string;
} {
  const title = matchStatusLabel(board);
  switch (board) {
    case 'waiting':
      return {
        short: 'Waiting',
        title,
        border: '#57534e',
        background: '#292524',
        color: '#e7e5e4',
      };
    case 'ready':
      return {
        short: 'Ready',
        title,
        border: '#ca8a04',
        background: '#422006',
        color: '#fef08a',
      };
    case 'live':
      return {
        short: 'Live',
        title,
        border: '#22c55e',
        background: '#14532d',
        color: '#bbf7d0',
      };
    case 'resolved':
      return {
        short: 'Resolved',
        title,
        border: '#3b82f6',
        background: '#1e3a5f',
        color: '#bfdbfe',
      };
    default:
      return {
        short: board,
        title,
        border: '#475569',
        background: '#1e293b',
        color: '#e2e8f0',
      };
  }
}

export function formatTournamentStatusLabel(status: string): string {
  const s = status.toLowerCase();
  if (s === 'pending') return 'Pending';
  if (s === 'active') return 'Active';
  if (s === 'completed') return 'Completed';
  return status;
}
