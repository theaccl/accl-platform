'use client';

import Link from 'next/link';

import {
  buildViewerObligationCopy,
  listOtherLiveTournamentBoards,
  viewerEntryCurrentRound,
  type TournamentMatchContinuity,
} from '@/lib/tournamentSessionContinuity';
import { formatTournamentStatusLabel } from '@/lib/tournamentReadModel';

type EntryRow = {
  user_id: string;
  current_round: number;
  eliminated: boolean;
};

type Props = {
  tournamentId: string;
  tournamentName: string;
  tournamentStatus: string;
  userId: string | null;
  isParticipant: boolean;
  entries: EntryRow[];
  matches: TournamentMatchContinuity[];
  gameStatusById: Record<string, string>;
  maxRound: number;
};

/**
 * Live tournament session shell — round, obligation, other boards, event status.
 */
export function TournamentSessionShell({
  tournamentId,
  tournamentName,
  tournamentStatus,
  userId,
  isParticipant,
  entries,
  matches,
  gameStatusById,
  maxRound,
}: Props) {
  if (!isParticipant || !userId) return null;

  const statusLower = String(tournamentStatus ?? '').toLowerCase();
  if (statusLower !== 'active') return null;

  const entry = entries.find((e) => e.user_id === userId);
  const eliminated = Boolean(entry?.eliminated);
  const playableRound = matches
    .filter((m) => (m.player1_id === userId || m.player2_id === userId) && !m.winner_id)
    .map((m) => m.round_number)
    .sort((a, b) => a - b)[0];
  const currentRound = viewerEntryCurrentRound(
    userId,
    entries,
    playableRound ?? maxRound ?? 1,
  );

  const obligation = buildViewerObligationCopy({
    userId,
    tournamentStatus,
    matches,
    gameStatusById,
    eliminated,
  });

  const otherBoards = listOtherLiveTournamentBoards(userId, matches, gameStatusById);

  return (
    <section
      data-testid="tournament-session-shell"
      style={{
        marginTop: 16,
        padding: '16px 18px',
        borderRadius: 12,
        border: '1px solid #334155',
        background: 'linear-gradient(180deg, #0f172a 0%, #0c1220 100%)',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.08em',
          color: '#64748b',
          textTransform: 'uppercase',
        }}
      >
        Tournament session
      </p>
      <p style={{ margin: '6px 0 0 0', fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>{tournamentName}</p>
      <p style={{ margin: '6px 0 0 0', fontSize: 13, color: '#94a3b8' }} data-testid="tournament-session-status">
        <strong style={{ color: '#cbd5e1' }}>{formatTournamentStatusLabel(tournamentStatus)}</strong>
        {statusLower === 'active' ? (
          <>
            {' '}
            · Round <strong style={{ color: '#e2e8f0' }}>{currentRound}</strong>
            {maxRound > currentRound ? (
              <span style={{ color: '#64748b' }}> (bracket through round {maxRound})</span>
            ) : null}
          </>
        ) : null}
      </p>

      <div
        data-testid="tournament-session-obligation"
        style={{
          marginTop: 14,
          padding: '12px 14px',
          borderRadius: 10,
          border:
            obligation.gameId && statusLower === 'active'
              ? '2px solid #2563eb'
              : '1px solid #475569',
          background: obligation.gameId ? '#0c1929' : '#111827',
        }}
      >
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: '#93c5fd', letterSpacing: '0.05em' }}>
          {obligation.headline.toUpperCase()}
        </p>
        <p style={{ margin: '6px 0 0 0', fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>{obligation.detail}</p>
        {obligation.gameId && statusLower === 'active' ? (
          <Link
            href={`/game/${obligation.gameId}`}
            data-testid="tournament-session-play-link"
            style={{
              display: 'inline-block',
              marginTop: 12,
              padding: '8px 16px',
              borderRadius: 8,
              background: '#2563eb',
              color: '#fff',
              fontWeight: 700,
              textDecoration: 'none',
              fontSize: 13,
            }}
          >
            Open your board
          </Link>
        ) : statusLower === 'active' && !eliminated ? (
          <p style={{ margin: '10px 0 0 0', fontSize: 12, color: '#94a3b8' }}>
            Stay here until your next board spawns — free-play queues are secondary while this event is live.
          </p>
        ) : null}
      </div>

      {otherBoards.length > 0 ? (
        <div style={{ marginTop: 14 }} data-testid="tournament-session-other-boards">
          <p style={{ margin: '0 0 8px 0', fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>
            Other live boards in this event
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {otherBoards.map((b) => (
              <li key={b.gameId}>
                <Link
                  href={`/game/${b.gameId}`}
                  data-testid={`tournament-session-watch-${b.gameId}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid #1e3a5f',
                    background: '#0f2744',
                    color: '#93c5fd',
                    fontSize: 13,
                    textDecoration: 'none',
                  }}
                >
                  <span>
                    Round {b.roundNumber}, match {b.matchNumber}
                  </span>
                  <span style={{ fontWeight: 700 }}>Watch →</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p style={{ margin: '14px 0 0 0', fontSize: 11, color: '#64748b' }}>
        <Link href={`/tournaments/${tournamentId}`} style={{ color: '#64748b' }}>
          Event hub
        </Link>
        {' · '}
        Phase 1 single elimination — one active tournament board per player.
      </p>
    </section>
  );
}
