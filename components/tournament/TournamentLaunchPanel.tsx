'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
  findViewerPlayableMatch,
  TOURNAMENT_FIELD_READY_MESSAGE,
} from '@/lib/tournamentSessionContinuity';
import {
  launchCountdownRemainingSec,
  LIVE_LAUNCH_COUNTDOWN_SEC,
} from '@/lib/tournamentLaunchAttendance';

export type TournamentLaunchPanelMeta = {
  tournamentId: string;
  tournamentStatus: string;
  tempo: string;
  createdById: string | null;
  launchScheduledAt: string | null;
  entrantCount: number;
  bracketTargetSize: number;
  matchCount: number;
  isBracketFull: boolean;
  canBootstrap: boolean;
  canOperate: boolean;
  isModerator: boolean;
  isCreator: boolean;
  isParticipant: boolean;
  launch: {
    isLiveTournament: boolean;
    checkedInCount: number;
    presentCount: number;
    standbyCount: number;
  };
};

type Props = {
  currentUserId: string | null;
  meta: TournamentLaunchPanelMeta;
  onReload: () => Promise<void>;
};

const TOURNAMENT_STARTED_REDIRECT_MSG = 'Tournament started. Taking you to your board.';

export function TournamentLaunchPanel({
  currentUserId,
  meta,
  onReload,
}: Props) {
  const router = useRouter();
  const [showDebug, setShowDebug] = useState(
    () => process.env.NODE_ENV === 'development',
  );

  useEffect(() => {
    setShowDebug(
      process.env.NODE_ENV === 'development' ||
        window.location.search.includes('debug=1'),
    );
  }, []);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [countdownSec, setCountdownSec] = useState<number | null>(
    launchCountdownRemainingSec(meta.launchScheduledAt),
  );

  const pending = String(meta.tournamentStatus).toLowerCase() === 'pending';
  const emptyBracket = meta.matchCount === 0;
  const fieldReady = pending && meta.isBracketFull && emptyBracket;

  useEffect(() => {
    if (!meta.launchScheduledAt) {
      setCountdownSec(null);
      return;
    }
    const tick = () => {
      setCountdownSec(launchCountdownRemainingSec(meta.launchScheduledAt));
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [meta.launchScheduledAt]);

  useEffect(() => {
    if (!currentUserId || !meta.isParticipant || !fieldReady) return;
    const heartbeat = () => {
      void fetch(`/api/tournaments/${encodeURIComponent(meta.tournamentId)}/check-in`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ explicit: false }),
      });
    };
    heartbeat();
    const id = window.setInterval(heartbeat, 12000);
    return () => window.clearInterval(id);
  }, [currentUserId, meta.isParticipant, meta.tournamentId, fieldReady]);

  const redirectAfterBootstrap = useCallback(async () => {
    await onReload();
    if (!currentUserId) return;
    const snapRes = await fetch(
      `/api/tournaments/${encodeURIComponent(meta.tournamentId)}/snapshot`,
      { credentials: 'include' },
    );
    const snap = (await snapRes.json()) as {
      matches?: Array<{
        round: number;
        matchNumber: number;
        gameId: string | null;
        player1?: { userId: string | null };
        player2?: { userId: string | null };
        winnerUserId?: string | null;
      }>;
      gameStatusById?: Record<string, string>;
    };
    const mapped = (snap.matches ?? []).map((m) => ({
      round_number: m.round,
      match_number: m.matchNumber,
      player1_id: m.player1?.userId ?? null,
      player2_id: m.player2?.userId ?? null,
      game_id: m.gameId,
      winner_id: m.winnerUserId ?? null,
    }));
    const playable = findViewerPlayableMatch(
      currentUserId,
      mapped,
      snap.gameStatusById ?? {},
    );
    if (playable?.game_id) {
      setMsg(TOURNAMENT_STARTED_REDIRECT_MSG);
      router.replace(`/game/${playable.game_id}`);
    } else {
      setMsg('Tournament started. Stay on this page for your next board.');
      await onReload();
    }
  }, [currentUserId, meta.tournamentId, onReload, router]);

  const runBootstrap = useCallback(async () => {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const res = await fetch(`/api/tournaments/${encodeURIComponent(meta.tournamentId)}/bootstrap`, {
      method: 'POST',
      credentials: 'include',
    });
    const j = (await res.json()) as { ok?: boolean; error?: string; code?: string };
    setBusy(false);
    if (!res.ok || !j.ok) {
      setErr(j.error ?? 'Could not start tournament.');
      return;
    }
    await redirectAfterBootstrap();
  }, [meta.tournamentId, redirectAfterBootstrap]);

  const onStartClick = useCallback(async () => {
    if (!meta.canBootstrap) return;
    setBusy(true);
    setErr(null);
    setMsg(null);

    if (meta.launch.isLiveTournament) {
      const schedRes = await fetch(
        `/api/tournaments/${encodeURIComponent(meta.tournamentId)}/launch-schedule`,
        { method: 'POST', credentials: 'include' },
      );
      const sched = (await schedRes.json()) as { ok?: boolean; error?: string; launch_scheduled_at?: string };
      if (!schedRes.ok || !sched.ok) {
        setBusy(false);
        setErr(sched.error ?? 'Could not schedule launch countdown.');
        return;
      }
      await onReload();
      setBusy(false);
      setMsg(`Launch check — ${LIVE_LAUNCH_COUNTDOWN_SEC}s countdown started. Check in now.`);
      return;
    }

    await runBootstrap();
  }, [meta.canBootstrap, meta.launch.isLiveTournament, meta.tournamentId, onReload, runBootstrap]);

  const autoBootstrapFiredRef = useRef(false);

  useEffect(() => {
    if (!meta.canOperate || !meta.launch.isLiveTournament || !meta.launchScheduledAt) return;
    if (countdownSec !== 0) return;
    if (busy || autoBootstrapFiredRef.current) return;
    autoBootstrapFiredRef.current = true;
    void runBootstrap();
  }, [meta.canOperate, meta.launch.isLiveTournament, meta.launchScheduledAt, countdownSec, busy, runBootstrap]);

  const onCheckIn = useCallback(async () => {
    setErr(null);
    const res = await fetch(`/api/tournaments/${encodeURIComponent(meta.tournamentId)}/check-in`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ explicit: true }),
    });
    const j = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      setErr(j.error ?? 'Check-in failed.');
      return;
    }
    await onReload();
    setMsg('You are checked in for launch.');
  }, [meta.tournamentId, onReload]);

  const hostMatchesCreator = useMemo(
    () =>
      Boolean(
        meta.createdById &&
          currentUserId &&
          meta.createdById === currentUserId,
      ),
    [meta.createdById, currentUserId],
  );

  if (!fieldReady) return null;

  return (
    <section
      data-testid="tournament-launch-panel"
      style={{
        marginTop: 16,
        padding: '16px 18px',
        borderRadius: 12,
        border: '2px solid #16a34a',
        background: 'linear-gradient(180deg, #052e16 0%, #0f172a 100%)',
      }}
    >
      <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: '#86efac', letterSpacing: '0.08em' }}>
        {meta.launch.isLiveTournament ? 'LIVE TOURNAMENT — LAUNCH' : 'TOURNAMENT READY'}
      </p>

      {meta.isParticipant ? (
        <div style={{ marginTop: 10 }} data-testid="tournament-launch-participant-copy">
          <p style={{ margin: 0, fontSize: 14, color: '#dcfce7', lineHeight: 1.5 }}>
            <strong>Tournament ready.</strong> Do not start a new game.
          </p>
          {meta.launch.isLiveTournament ? (
            <p style={{ margin: '8px 0 0 0', fontSize: 13, color: '#bbf7d0' }}>
              Launch check starting soon — you will be redirected when the tournament starts.
            </p>
          ) : (
            <p style={{ margin: '8px 0 0 0', fontSize: 13, color: '#94a3b8' }}>{TOURNAMENT_FIELD_READY_MESSAGE}</p>
          )}
          <button
            type="button"
            data-testid="tournament-check-in-button"
            onClick={() => void onCheckIn()}
            style={{
              marginTop: 12,
              padding: '8px 14px',
              borderRadius: 8,
              border: '1px solid #22c55e',
              background: '#14532d',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            I am here (check in)
          </button>
          <p style={{ margin: '8px 0 0 0', fontSize: 11, color: '#6ee7b7' }}>
            Present: {meta.launch.presentCount} / {meta.entrantCount} · Checked in: {meta.launch.checkedInCount}
          </p>
        </div>
      ) : null}

      {countdownSec != null && countdownSec > 0 ? (
        <p
          data-testid="tournament-launch-countdown"
          style={{ margin: '12px 0 0 0', fontSize: 22, fontWeight: 800, color: '#fde68a' }}
        >
          Launch in {countdownSec}s
        </p>
      ) : null}

      {meta.canOperate && meta.canBootstrap ? (
        <div style={{ marginTop: 14 }}>
          <p style={{ margin: '0 0 10px 0', fontSize: 14, color: '#e2e8f0', fontWeight: 600 }}>
            Ready to start — Start Tournament
          </p>
          <button
            type="button"
            data-testid="tournament-start-button"
            disabled={busy || (meta.launch.isLiveTournament && countdownSec != null && countdownSec > 0)}
            onClick={() => void onStartClick()}
            style={{
              padding: '12px 20px',
              borderRadius: 8,
              border: '1px solid #16a34a',
              background: '#15803d',
              color: '#fff',
              fontWeight: 800,
              fontSize: 15,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy
              ? 'Starting…'
              : meta.launch.isLiveTournament && countdownSec == null
                ? `Start Tournament (${LIVE_LAUNCH_COUNTDOWN_SEC}s launch check)`
                : meta.launch.isLiveTournament && countdownSec != null && countdownSec > 0
                  ? 'Launch countdown running…'
                  : 'Start Tournament'}
          </button>
          {meta.launch.isLiveTournament && countdownSec === 0 && meta.canOperate ? (
            <button
              type="button"
              data-testid="tournament-start-after-countdown"
              disabled={busy}
              onClick={() => void runBootstrap()}
              style={{
                marginLeft: 10,
                padding: '12px 16px',
                borderRadius: 8,
                border: '1px solid #2563eb',
                background: '#1d4ed8',
                color: '#fff',
                fontWeight: 700,
                cursor: busy ? 'not-allowed' : 'pointer',
              }}
            >
              Spawn bracket now
            </button>
          ) : null}
        </div>
      ) : (
        <p
          data-testid="tournament-launch-waiting-host"
          style={{ margin: '14px 0 0 0', fontSize: 14, color: '#fcd34d', lineHeight: 1.5 }}
        >
          Ready to start — waiting for host/operator
        </p>
      )}

      {err ? (
        <p data-testid="tournament-bootstrap-error" style={{ margin: '12px 0 0 0', color: '#fecaca', fontSize: 13 }}>
          {err}
        </p>
      ) : null}
      {msg ? (
        <p data-testid="tournament-launch-message" style={{ margin: '10px 0 0 0', color: '#93c5fd', fontSize: 13 }}>
          {msg}
        </p>
      ) : null}

      {showDebug ? (
        <details style={{ marginTop: 14 }} data-testid="tournament-launch-debug">
          <summary style={{ cursor: 'pointer', fontSize: 12, color: '#94a3b8' }}>Launch debug</summary>
          <pre
            style={{
              marginTop: 8,
              padding: 10,
              fontSize: 11,
              overflow: 'auto',
              background: '#020617',
              borderRadius: 8,
              color: '#cbd5e1',
            }}
          >
            {JSON.stringify(
              {
                viewerUserId: currentUserId,
                createdById: meta.createdById,
                hostMatchesCreator,
                canOperate: meta.canOperate,
                isModerator: meta.isModerator,
                isCreator: meta.isCreator,
                canBootstrap: meta.canBootstrap,
                entrantCount: meta.entrantCount,
                bracketTargetSize: meta.bracketTargetSize,
                matchCount: meta.matchCount,
                isBracketFull: meta.isBracketFull,
                isLive: meta.launch.isLiveTournament,
                tempo: meta.tempo,
                launchScheduledAt: meta.launchScheduledAt,
                countdownSec,
                presentCount: meta.launch.presentCount,
                checkedInCount: meta.launch.checkedInCount,
                standbyCount: meta.launch.standbyCount,
              },
              null,
              2,
            )}
          </pre>
        </details>
      ) : null}
    </section>
  );
}
