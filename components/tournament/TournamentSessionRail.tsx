'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

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
  player1?: { userId: string | null };
  player2?: { userId: string | null };
  winnerUserId: string | null;
};

type Props = {
  tournamentId: string;
  currentGameId: string;
  userId: string | null;
};

/**
 * Compact tournament context rail beside the main board (read-model only).
 */
export function TournamentSessionRail({ tournamentId, currentGameId, userId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tournamentName, setTournamentName] = useState('Tournament');
  const [tournamentStatus, setTournamentStatus] = useState('active');
  const [matches, setMatches] = useState<TournamentMatchContinuity[]>([]);
  const [gameStatusById, setGameStatusById] = useState<Record<string, string>>({});
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
        className="w-full shrink-0 rounded-xl border border-slate-600/50 bg-slate-900/80 p-3 text-xs text-slate-400 lg:w-[220px]"
      >
        Loading tournament context…
      </aside>
    );
  }

  return (
    <aside
      data-testid="tournament-session-rail"
      className="w-full shrink-0 rounded-xl border border-slate-600/50 bg-slate-900/90 p-3 text-xs text-slate-200 lg:w-[220px]"
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
          Round {currentRound} boards
        </p>
        {sameRoundBoards.length === 0 ? (
          <p className="mt-1 text-[11px] text-slate-500">No other live boards this round.</p>
        ) : (
          <ul className="mt-1.5 flex flex-col gap-1">
            {sameRoundBoards.map((b) => (
              <li key={b.gameId}>
                {b.isCurrentBoard ? (
                  <span
                    data-testid={`tournament-rail-board-current-${b.gameId}`}
                    className="block rounded-md border border-emerald-500/40 bg-emerald-950/30 px-2 py-1.5 text-[11px] font-semibold text-emerald-100"
                  >
                    Match {b.matchNumber} — you are here
                  </span>
                ) : (
                  <Link
                    href={`/game/${b.gameId}`}
                    data-testid={`tournament-rail-board-${b.gameId}`}
                    className="block rounded-md border border-slate-600/70 bg-slate-800/50 px-2 py-1.5 text-[11px] text-sky-200 hover:border-sky-500/40"
                  >
                    Match {b.matchNumber}
                    {b.isYourMatch ? ' · your board' : ' · watch'}
                  </Link>
                )}
              </li>
            ))}
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
