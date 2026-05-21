import { clockBudgetMsForGame } from '@/lib/gameTimeControl';
import { isLobbyYourMove, type LobbyObligationRow } from '@/lib/lobbyObligationPresentation';
import type { TournamentRailBoardRow } from '@/lib/tournamentSessionContinuity';

export type ClockUrgencyTier = 'green' | 'yellow' | 'red' | 'muted';

export type TournamentRailGameOps = {
  status: string;
  turn: string | null;
  white_clock_ms: number | null;
  black_clock_ms: number | null;
  white_player_id: string;
  black_player_id: string | null;
  tempo: string | null;
  live_time_control: string | null;
};

export type EnrichedRailBoardRow = TournamentRailBoardRow & {
  opponentLabel: string;
  statusLabel: string;
  turnLabel: string;
  clockLabel: string | null;
  urgency: ClockUrgencyTier;
  sortKey: number;
  isFinished: boolean;
};

export function clockUrgencyTier(remainingMs: number, budgetMs: number): ClockUrgencyTier {
  if (!Number.isFinite(remainingMs) || !Number.isFinite(budgetMs) || budgetMs <= 0) return 'muted';
  const ratio = remainingMs / budgetMs;
  if (ratio <= 1 / 3) return 'red';
  if (ratio <= 2 / 3) return 'yellow';
  return 'green';
}

export function urgencyRank(tier: ClockUrgencyTier): number {
  if (tier === 'red') return 0;
  if (tier === 'yellow') return 1;
  if (tier === 'green') return 2;
  return 3;
}

export function enrichTournamentRailBoardRows(input: {
  boards: TournamentRailBoardRow[];
  userId: string | null;
  gameOpsById: Record<string, TournamentRailGameOps>;
  displayNamesByUserId: Record<string, string>;
  matchPlayerIds: Record<string, { p1: string | null; p2: string | null }>;
}): EnrichedRailBoardRow[] {
  const { boards, userId, gameOpsById, displayNamesByUserId, matchPlayerIds } = input;
  const enriched: EnrichedRailBoardRow[] = [];

  for (const b of boards) {
    const ops = gameOpsById[b.gameId];
    const players = matchPlayerIds[b.gameId];
    const isFinished = ops?.status === 'finished';
    let opponentLabel = 'Opponent';
    let turnLabel = '—';
    let clockLabel: string | null = null;
    let urgency: ClockUrgencyTier = 'muted';
    let sortKey = 500;

    if (ops && userId) {
      const oppId =
        ops.white_player_id === userId
          ? ops.black_player_id
          : ops.black_player_id === userId
            ? ops.white_player_id
            : players?.p1 === userId
              ? players?.p2
              : players?.p2 === userId
                ? players?.p1
                : null;
      if (oppId) opponentLabel = displayNamesByUserId[oppId] ?? 'Opponent';
      const yourTurn = isLobbyYourMove(ops as LobbyObligationRow, userId);
      turnLabel = yourTurn ? 'Your turn' : b.isYourMatch ? 'Waiting' : 'Watching';
      const budget = clockBudgetMsForGame(ops.tempo, ops.live_time_control);
      const remaining =
        ops.turn === 'white'
          ? Number(ops.white_clock_ms ?? budget)
          : ops.turn === 'black'
            ? Number(ops.black_clock_ms ?? budget)
            : budget;
      urgency = yourTurn ? clockUrgencyTier(remaining, budget) : 'muted';
      if (b.isCurrentBoard) sortKey = -1000;
      else if (isFinished) sortKey = 900;
      else if (yourTurn) sortKey = urgencyRank(urgency) * 10;
      else if (b.isYourMatch) sortKey = 200;
      else sortKey = 400 + b.matchNumber;
      if (yourTurn && Number.isFinite(remaining)) {
        clockLabel = `${Math.max(0, Math.ceil(remaining / 1000))}s`;
      }
    }

    enriched.push({
      ...b,
      opponentLabel,
      statusLabel: isFinished ? 'Complete' : b.isCurrentBoard ? 'Current board' : turnLabel,
      turnLabel,
      clockLabel,
      urgency,
      sortKey,
      isFinished,
    });
  }

  return enriched.sort((a, b) => a.sortKey - b.sortKey || a.matchNumber - b.matchNumber);
}

export const RAIL_URGENCY_BORDER: Record<ClockUrgencyTier, string> = {
  green: 'border-emerald-500/45',
  yellow: 'border-amber-500/50',
  red: 'border-red-500/55',
  muted: 'border-slate-600/70',
};
