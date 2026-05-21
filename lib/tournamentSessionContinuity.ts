import { nextPowerOf2 } from '@/lib/tournamentBracket';
import { matchBoardStatus, type MatchBoardStatus } from '@/lib/tournamentReadModel';
import { parseGameIdFromPath } from '@/lib/gameAcceptRedirectPriority';

export const TOURNAMENT_GAME_ACTIVE_STATUSES = ['active', 'waiting'] as const;

export type TournamentMatchContinuity = {
  id?: string;
  round_number: number;
  match_number: number;
  player1_id: string | null;
  player2_id: string | null;
  game_id: string | null;
  winner_id: string | null;
};

export type TournamentSessionGameRef = {
  tournamentId: string;
  gameId: string;
};

export type TournamentSessionParticipationRef = {
  tournamentId: string;
};

export type TournamentFieldReadyRef = {
  tournamentId: string;
  tournamentName: string;
};

export const TOURNAMENT_FIELD_READY_MESSAGE =
  'Tournament is ready. Do not start a new game. You are being redirected when the tournament starts.';

/** Live bracket session — pending registration does not hold players in-shell. */
export function isTournamentSessionLive(status: string): boolean {
  return String(status ?? '').trim().toLowerCase() === 'active';
}

const FREE_TOURNAMENT_MAX_ENTRANTS = 8;

function bracketTargetSize(entrantCount: number): number {
  const n = Math.max(0, Math.floor(entrantCount));
  if (n < 2) return 2;
  return Math.min(FREE_TOURNAMENT_MAX_ENTRANTS, nextPowerOf2(n));
}

/** Pending event with a full bracket waiting for host start. */
export function isTournamentFieldReady(status: string, entrantCount: number): boolean {
  if (String(status ?? '').trim().toLowerCase() !== 'pending') return false;
  const n = Math.max(0, Math.floor(entrantCount));
  return n >= 2 && n === bracketTargetSize(n);
}

export function parseTournamentIdFromPath(path: string): string | null {
  const m = /^\/tournaments\/([^/?#]+)/.exec(path);
  const id = m?.[1]?.trim();
  return id && id.length > 0 ? id : null;
}

/** Free-play discovery surfaces where tournament session capture applies. */
export function isFreePlayDiscoveryPath(path: string): boolean {
  const p = path.split('?')[0] ?? '';
  if (p === '/free' || p === '/free/') return true;
  return /^\/free\/(lobby|play|active|create)(\/|$)/.test(p);
}

export function findViewerPlayableMatch<M extends TournamentMatchContinuity>(
  userId: string | null,
  matches: M[],
  gameStatusById: Record<string, string>,
): M | null {
  if (!userId) return null;
  const mine = matches
    .filter(
      (m) =>
        (m.player1_id === userId || m.player2_id === userId) &&
        !m.winner_id &&
        m.player1_id &&
        m.player2_id,
    )
    .sort((a, b) => a.round_number - b.round_number || a.match_number - b.match_number);
  for (const m of mine) {
    if (!m.game_id) continue;
    const board = matchBoardStatus(m, gameStatusById[m.game_id]);
    if (board === 'ready' || board === 'live' || board === 'waiting') return m;
  }
  return null;
}

/** Next undecided match for the viewer (including not-yet-spawned boards). */
export function findViewerNextMatch<M extends TournamentMatchContinuity>(
  userId: string | null,
  matches: M[],
): M | null {
  if (!userId) return null;
  const mine = matches
    .filter((m) => (m.player1_id === userId || m.player2_id === userId) && !m.winner_id)
    .sort((a, b) => a.round_number - b.round_number || a.match_number - b.match_number);
  return mine[0] ?? null;
}

export function viewerEntryCurrentRound(
  userId: string | null,
  entries: Array<{ user_id: string; current_round: number; eliminated: boolean }>,
  fallbackRound: number,
): number {
  if (!userId) return fallbackRound;
  const e = entries.find((x) => x.user_id === userId);
  if (!e || e.eliminated) return fallbackRound;
  return e.current_round > 0 ? e.current_round : fallbackRound;
}

export type ViewerObligationCopy = {
  headline: string;
  detail: string;
  boardStatus: MatchBoardStatus | 'eliminated' | 'complete' | 'between_rounds';
  gameId: string | null;
};

export function buildViewerObligationCopy(input: {
  userId: string | null;
  tournamentStatus: string;
  matches: TournamentMatchContinuity[];
  gameStatusById: Record<string, string>;
  eliminated: boolean;
}): ViewerObligationCopy {
  const status = String(input.tournamentStatus ?? '').toLowerCase();
  if (input.eliminated) {
    return {
      headline: 'Eliminated',
      detail: 'Follow the bracket until the event completes.',
      boardStatus: 'eliminated',
      gameId: null,
    };
  }
  if (status === 'completed') {
    return {
      headline: 'Tournament complete',
      detail: 'No further bracket obligations.',
      boardStatus: 'complete',
      gameId: null,
    };
  }
  if (status !== 'active') {
    return {
      headline: 'Waiting for start',
      detail: 'The host will start the bracket when the field is full.',
      boardStatus: 'between_rounds',
      gameId: null,
    };
  }

  const playable = findViewerPlayableMatch(input.userId, input.matches, input.gameStatusById);
  if (playable?.game_id) {
    const board = matchBoardStatus(playable, input.gameStatusById[playable.game_id]);
    return {
      headline: 'Your match is ready',
      detail: `Round ${playable.round_number}, match ${playable.match_number} — open your board to play.`,
      boardStatus: board,
      gameId: playable.game_id,
    };
  }

  const next = findViewerNextMatch(input.userId, input.matches);
  if (!next) {
    return {
      headline: 'Between rounds',
      detail: 'Stay on this page — your next bracket board will appear here when spawned.',
      boardStatus: 'between_rounds',
      gameId: null,
    };
  }
  if (!next.player1_id || !next.player2_id) {
    return {
      headline: 'Waiting for opponent',
      detail: `Round ${next.round_number} — bracket slot not paired yet.`,
      boardStatus: 'waiting',
      gameId: null,
    };
  }
  if (!next.game_id) {
    return {
      headline: 'Board spawning',
      detail: `Round ${next.round_number}, match ${next.match_number} — your board will appear when spawned.`,
      boardStatus: 'ready',
      gameId: null,
    };
  }

  return {
    headline: 'Between rounds',
    detail: 'Stay in the tournament hub until your next board is ready.',
    boardStatus: 'between_rounds',
    gameId: null,
  };
}

export type OtherLiveBoardRow = {
  gameId: string;
  roundNumber: number;
  matchNumber: number;
};

export type TournamentRailBoardRow = OtherLiveBoardRow & {
  isYourMatch: boolean;
  isCurrentBoard: boolean;
};

/** Match row for the active game id, if any. */
export function findMatchForGameId<M extends TournamentMatchContinuity & { id?: string }>(
  gameId: string | null,
  matches: M[],
): M | null {
  const gid = String(gameId ?? '').trim();
  if (!gid) return null;
  return matches.find((m) => m.game_id === gid) ?? null;
}

/** Boards in the same round with spawned games (includes viewer's other seats in round). */
export function listSameRoundTournamentBoards<M extends TournamentMatchContinuity>(
  roundNumber: number,
  matches: M[],
  gameStatusById: Record<string, string>,
  currentGameId: string | null,
  userId: string | null,
): TournamentRailBoardRow[] {
  const out: TournamentRailBoardRow[] = [];
  for (const m of matches) {
    if (m.round_number !== roundNumber || !m.game_id) continue;
    const board = matchBoardStatus(m, gameStatusById[m.game_id]);
    if (board !== 'live' && board !== 'ready' && board !== 'resolved') continue;
    const isYourMatch = Boolean(
      userId && (m.player1_id === userId || m.player2_id === userId),
    );
    out.push({
      gameId: m.game_id,
      roundNumber: m.round_number,
      matchNumber: m.match_number,
      isYourMatch,
      isCurrentBoard: m.game_id === currentGameId,
    });
  }
  out.sort((a, b) => a.matchNumber - b.matchNumber);
  return out;
}

/** Live boards in this event that the viewer is not seated on (spectate / awareness). */
export function listOtherLiveTournamentBoards<M extends TournamentMatchContinuity>(
  userId: string | null,
  matches: M[],
  gameStatusById: Record<string, string>,
): OtherLiveBoardRow[] {
  if (!userId) return [];
  const out: OtherLiveBoardRow[] = [];
  for (const m of matches) {
    if (!m.game_id) continue;
    if (m.player1_id === userId || m.player2_id === userId) continue;
    const board = matchBoardStatus(m, gameStatusById[m.game_id]);
    if (board !== 'live' && board !== 'ready') continue;
    out.push({
      gameId: m.game_id,
      roundNumber: m.round_number,
      matchNumber: m.match_number,
    });
  }
  out.sort((a, b) => a.roundNumber - b.roundNumber || a.matchNumber - b.matchNumber);
  return out;
}

export type TournamentSessionRedirectTarget = {
  href: string;
  kind: 'game' | 'tournament';
  tournamentId: string;
  gameId?: string;
};

/**
 * Highest-priority navigation for an active tournament participant on free-play discovery.
 * One spawned board per player (Phase 1): prefer active game, else tournament shell.
 */
export function resolveTournamentSessionRedirectTarget(input: {
  pathname: string;
  activeGames: TournamentSessionGameRef[];
  activeParticipations: TournamentSessionParticipationRef[];
}): TournamentSessionRedirectTarget | null {
  const path = input.pathname.split('?')[0] ?? '';
  const pathTid = parseTournamentIdFromPath(path);
  const pathGameId = parseGameIdFromPath(path);

  const gameByTournament = new Map<string, string>();
  for (const g of input.activeGames) {
    if (!gameByTournament.has(g.tournamentId)) {
      gameByTournament.set(g.tournamentId, g.gameId);
    }
  }

  const tournamentIds = new Set<string>();
  for (const g of input.activeGames) tournamentIds.add(g.tournamentId);
  for (const p of input.activeParticipations) tournamentIds.add(p.tournamentId);

  if (tournamentIds.size === 0) return null;

  const orderedTournamentIds = [...tournamentIds].sort((a, b) => {
    const aGame = gameByTournament.has(a);
    const bGame = gameByTournament.has(b);
    if (aGame !== bGame) return aGame ? -1 : 1;
    return a.localeCompare(b);
  });

  const primaryTid = orderedTournamentIds[0]!;
  const primaryGameId = gameByTournament.get(primaryTid);

  if (primaryGameId) {
    if (pathGameId === primaryGameId) return null;
    if (
      isFreePlayDiscoveryPath(path) ||
      pathTid === primaryTid ||
      pathGameId != null
    ) {
      return {
        href: `/game/${primaryGameId}`,
        kind: 'game',
        tournamentId: primaryTid,
        gameId: primaryGameId,
      };
    }
    return null;
  }

  if (!isFreePlayDiscoveryPath(path)) return null;
  if (pathTid === primaryTid) return null;

  return {
    href: `/tournaments/${primaryTid}`,
    kind: 'tournament',
    tournamentId: primaryTid,
  };
}

export function tournamentContinuityHubLink(tournamentId: string): { href: string; label: string } {
  const tid = String(tournamentId ?? '').trim();
  return {
    href: tid ? `/tournaments/${tid}` : '/tournaments',
    label: 'Tournament hub',
  };
}
