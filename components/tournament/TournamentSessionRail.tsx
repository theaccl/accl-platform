'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  enrichTournamentRailBoardRows,
  RAIL_URGENCY_BORDER,
} from '@/lib/tournamentRailPresentation';
import {
  buildViewerObligationCopy,
  findMatchForGameId,
  findViewerNextMatch,
  listSameRoundTournamentBoards,
  type TournamentMatchContinuity,
} from '@/lib/tournamentSessionContinuity';
import { formatTournamentStatusLabel } from '@/lib/tournamentReadModel';

type SnapshotMatch = {
  id: string;
  round: number;
  matchNumber: number;
  gameId: string | null;
  player1?: { userId: string | null; displayName?: string | null };
  player2?: { userId: string | null; displayName?: string | null };
  winnerUserId: string | null;
};

type GameOps = {
  status: string;
  turn: string | null;
  white_clock_ms: number | null;
  black_clock_ms: number | null;
  white_player_id: string;
  black_player_id: string | null;
  tempo: string | null;
  live_time_control: string | null;
};

type Props = {
  tournamentId: string;
  currentGameId: string;
  userId: string | null;
};

/**
 * Tournament session rail — same-round board awareness with clock urgency and in-session switching.
 */
export function TournamentSessionRail({ tournamentId, currentGameId, userId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tournamentName, setTournamentName] = useState('Tournament');
  const [tournamentStatus, setTournamentStatus] = useState('active');
  const [matches, setMatches] = useState<TournamentMatchContinuity[]>([]);
  const [gameStatusById, setGameStatusById] = useState<Record<string, string>>({});
  const [gameOpsById, setGameOpsById] = useState<Record<string, GameOps>>({});
  const [displayNamesByUserId, setDisplayNamesByUserId] = useState<Record<string, string>>({});
  const [eliminated, setEliminated] = useState(false);

  const loadSnapshot = useCallback(async () => {
    const res = await fetch(`/api/tournaments/${encodeURIComponent(tournamentId)}/snapshot`, {
      credentials: 'include',
    });
    const j = (await res.json()) as {
      ok?: boolean;
      tournament?: { name: string; status: string };
      entries?: Array<{ userId: string; eliminated: boolean }>;
      matches?: SnapshotMatch[];
      gameStatusById?: Record<string, string>;
      gameOpsById?: Record<string, GameOps>;
      displayNamesByUserId?: Record<string, string>;
    };
    if (!res.ok || !j.ok || !j.tournament) {
      setLoading(false);
      return;
    }
    setTournamentName(j.tournament.name);
    setTournamentStatus(j.tournament.status);
    const entry = (j.entries ?? []).find((e) => e.userId === userId);
    setEliminated(Boolean(entry?.eliminated));
    setMatches(
      (j.matches ?? []).map((m) => ({
        round_number: m.round,
        match_number: m.matchNumber,
        player1_id: m.player1?.userId ?? null,
        player2_id: m.player2?.userId ?? null,
        game_id: m.gameId,
        winner_id: m.winnerUserId,
        id: m.id,
      })),
    );
    setGameStatusById(j.gameStatusById ?? {});
    setGameOpsById(j.gameOpsById ?? {});
    setDisplayNamesByUserId(j.displayNamesByUserId ?? {});
    setLoading(false);
  }, [tournamentId, userId]);

  useEffect(() => {
    void loadSnapshot();
    const t = window.setInterval(() => void loadSnapshot(), 8000);
    return () => window.clearInterval(t);
  }, [loadSnapshot]);

  const currentMatch = useMemo(
    () => findMatchForGameId(currentGameId, matches),
    [currentGameId, matches],
  );
  const currentRound = currentMatch?.round_number ?? 1;

  const sameRoundBoards = useMemo(
    () => listSameRoundTournamentBoards(currentRound, matches, gameStatusById, currentGameId, userId),
    [currentRound, matches, gameStatusById, currentGameId, userId],
  );

  const matchPlayerIds = useMemo(() => {
    const out: Record<string, { p1: string | null; p2: string | null }> = {};
    for (const m of matches) {
      if (!m.game_id) continue;
      out[m.game_id] = { p1: m.player1_id, p2: m.player2_id };
    }
    return out;
  }, [matches]);

  const enrichedBoards = useMemo(
    () =>
      enrichTournamentRailBoardRows({
        boards: sameRoundBoards,
        userId,
        gameOpsById,
        displayNamesByUserId,
        matchPlayerIds,
      }),
    [sameRoundBoards, userId, gameOpsById, displayNamesByUserId, matchPlayerIds],
  );

  const activeBoards = enrichedBoards.filter((b) => !b.isFinished);
  const completedBoards = enrichedBoards.filter((b) => b.isFinished);

  const upcoming = useMemo(() => findViewerNextMatch(userId, matches), [userId, matches]);

  const obligation = useMemo(
    () =>
      buildViewerObligationCopy({
        userId,
        tournamentStatus,
        matches,
        gameStatusById,
        eliminated,
      }),
    [userId, tournamentStatus, matches, gameStatusById, eliminated],
  );

  if (loading) {
    return (
      <aside
        data-testid="tournament-session-rail"
        className="w-full shrink-0 rounded-xl border border-slate-600/50 bg-slate-900/80 p-3 text-xs text-slate-400 lg:max-h-[min(80dvh,720px)] lg:w-[240px] lg:overflow-y-auto"
      >
        Loading tournament context…
      </aside>
    );
  }

  return (
    <aside
      data-testid="tournament-session-rail"
      className="accl-scroll-no-anchor w-full shrink-0 rounded-xl border border-slate-600/50 bg-slate-900/90 p-3 text-xs text-slate-200 lg:max-h-[min(80dvh,720px)] lg:w-[240px] lg:overflow-y-auto"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Tournament session</p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{tournamentName}</p>
      <p className="mt-1 text-[11px] text-slate-400" data-testid="tournament-rail-status">
        {formatTournamentStatusLabel(tournamentStatus)}
        {' · '}
        Round {currentRound}
      </p>

      <div className="mt-3 rounded-lg border border-slate-600/60 bg-slate-950/60 px-2.5 py-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-sky-300/90">{obligation.headline}</p>
        <p className="mt-1 text-[11px] leading-snug text-slate-300">{obligation.detail}</p>
        {obligation.gameId && obligation.gameId !== currentGameId ? (
          <button
            type="button"
            data-testid="tournament-rail-your-board"
            className="mt-2 w-full rounded-md border border-sky-500/50 bg-sky-900/40 px-2 py-1.5 text-[11px] font-bold text-sky-100"
            onClick={() => router.push(`/game/${obligation.gameId}`)}
          >
            Your match →
          </button>
        ) : null}
      </div>

      {upcoming && upcoming.game_id !== currentGameId ? (
        <div className="mt-3" data-testid="tournament-rail-upcoming">
          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-200/80">Upcoming</p>
          <p className="mt-1 text-[11px] text-slate-300">
            Round {upcoming.round_number}, match {upcoming.match_number}
            {!upcoming.game_id ? ' — board not spawned yet' : ''}
          </p>
        </div>
      ) : null}

      <div className="mt-3" data-testid="tournament-rail-round-boards">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Round {currentRound} boards ({activeBoards.length + completedBoards.length})
        </p>
        {enrichedBoards.length === 0 ? (
          <p className="mt-1 text-[11px] text-slate-500">No other live boards this round.</p>
        ) : (
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {activeBoards.map((b) => (
              <li key={b.gameId}>
                {b.isCurrentBoard ? (
                  <span
                    data-testid={`tournament-rail-board-current-${b.gameId}`}
                    className={`block rounded-md border px-2 py-2 text-[11px] font-semibold text-emerald-100 ${RAIL_URGENCY_BORDER[b.urgency]} bg-emerald-950/30`}
                  >
                    <span className="block">Match {b.matchNumber} — you are here</span>
                    <span className="mt-0.5 block font-normal text-emerald-200/80">
                      vs {b.opponentLabel} · {b.statusLabel}
                      {b.clockLabel ? ` · ${b.clockLabel}` : ''}
                    </span>
                  </span>
                ) : (
                  <button
                    type="button"
                    data-testid={`tournament-rail-board-${b.gameId}`}
                    onClick={() => router.push(`/game/${b.gameId}`)}
                    className={`block w-full rounded-md border bg-slate-800/50 px-2 py-2 text-left text-[11px] text-sky-200 hover:border-sky-500/40 ${RAIL_URGENCY_BORDER[b.urgency]}`}
                  >
                    <span className="font-semibold">
                      Match {b.matchNumber}
                      {b.isYourMatch ? ' · your board' : ' · switch'}
                    </span>
                    <span className="mt-0.5 block text-slate-400">
                      vs {b.opponentLabel} · {b.turnLabel}
                      {b.clockLabel ? ` · ${b.clockLabel}` : ''}
                    </span>
                  </button>
                )}
              </li>
            ))}
            {completedBoards.length > 0 ? (
              <li className="pt-1">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">Completed</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {completedBoards.map((b) => (
                    <li key={b.gameId}>
                      <Link
                        href={`/game/${b.gameId}?spectate=1`}
                        data-testid={`tournament-rail-board-done-${b.gameId}`}
                        className="block rounded-md border border-slate-700/60 bg-slate-900/40 px-2 py-1.5 text-[11px] text-slate-500"
                      >
                        Match {b.matchNumber} — complete
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ) : null}
          </ul>
        )}
      </div>

      <Link
        href={`/tournaments/${tournamentId}`}
        data-testid="tournament-rail-hub-link"
        className="mt-3 inline-block text-[11px] font-semibold text-sky-300 underline hover:text-sky-200"
      >
        Tournament hub
      </Link>
    </aside>
  );
}
