'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  LIVE_TOURNAMENT_FIRST_MOVE_GRACE_SEC,
  firstMoveGraceRemainingMs,
  shouldShowFirstMoveGraceUi,
  type FirstMoveGraceGameRow,
} from '@/lib/tournamentFirstMoveGrace';

type Props = {
  gameId: string;
  game: FirstMoveGraceGameRow;
  gameStatus: string;
  moveCount: number;
  userId: string | null;
  isMyTurn: boolean;
};

/**
 * Live tournament: first-move countdown before authoritative no-show finish.
 */
export function TournamentFirstMoveGraceBanner({
  gameId,
  game,
  gameStatus,
  moveCount,
  userId,
  isMyTurn,
}: Props) {
  const [remainingMs, setRemainingMs] = useState(() => firstMoveGraceRemainingMs(game));
  const [enforcing, setEnforcing] = useState(false);

  const visible = shouldShowFirstMoveGraceUi({ game, moveCount, gameStatus }) && Boolean(userId);

  const pollEnforce = useCallback(async () => {
    if (!visible) return;
    setEnforcing(true);
    try {
      await fetch(`/api/game/${encodeURIComponent(gameId)}/enforce-first-move-grace`, {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      setEnforcing(false);
    }
  }, [gameId, visible]);

  useEffect(() => {
    if (!visible) return;
    const tick = () => {
      const left = firstMoveGraceRemainingMs(game);
      setRemainingMs(left);
      if (left <= 0) void pollEnforce();
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [game, visible, pollEnforce]);

  if (!visible) return null;

  const secs = Math.max(0, Math.ceil(remainingMs / 1000));

  return (
    <div
      className="mb-3 rounded-lg border border-amber-500/45 bg-amber-950/35 px-3 py-2.5"
      data-testid="tournament-first-move-grace"
      role="status"
    >
      {isMyTurn ? (
        <>
          <p className="text-sm font-semibold text-amber-100">
            First move required in {secs}s
          </p>
          <p className="mt-1 text-xs leading-snug text-amber-200/85">
            Make your first move or you may be removed from this live tournament game. (
            {LIVE_TOURNAMENT_FIRST_MOVE_GRACE_SEC}s grace)
          </p>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-amber-100/95">Waiting for opponent&apos;s first move…</p>
          <p className="mt-1 text-xs text-amber-200/75">
            The bracket advances if they do not start within {LIVE_TOURNAMENT_FIRST_MOVE_GRACE_SEC}s.
          </p>
        </>
      )}
      {enforcing ? (
        <p className="mt-1 text-[10px] text-amber-300/70">Checking board status…</p>
      ) : null}
    </div>
  );
}
