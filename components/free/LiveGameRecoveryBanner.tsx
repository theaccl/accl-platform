'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import type { LobbyObligationRow } from '@/lib/lobbyObligationPresentation';
import { useLobbyUserObligations } from '@/hooks/useLobbyUserObligations';
import {
  LIVE_GAME_RECOVERY_RETURN_LABEL,
  liveRecoveryBoardLabel,
  selectSeatedLiveRecoveryRows,
} from '@/lib/liveGameRecovery';

export { LIVE_GAME_RECOVERY_RETURN_LABEL, selectSeatedLiveRecoveryRows };

type BannerProps = {
  rows: LobbyObligationRow[];
  uid: string | null;
};

/**
 * Presentation-only sticky urgent recovery banner for an active seated live board.
 * No server enforcement, no clock/finish authority, no redirect — just a dominant
 * "return to your live board" surface. Renders the single most urgent live board.
 */
export function LiveGameRecoveryBanner({ rows, uid }: BannerProps) {
  if (!uid || rows.length === 0) return null;
  const game = rows[0];
  return (
    <div
      data-testid="live-game-recovery-banner"
      role="alert"
      className="sticky top-0 z-30 mb-3 flex flex-col gap-3 rounded-xl border-2 border-red-500/60 bg-gradient-to-r from-red-950/90 to-[#1a0c10] px-4 py-3 shadow-[0_0_0_1px_rgba(248,113,113,0.25),0_10px_28px_-10px_rgba(248,113,113,0.55)] sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-red-300">
          Live game in progress
        </p>
        <p
          className="mt-0.5 truncate text-base font-bold text-white"
          data-testid="live-game-recovery-time-control"
        >
          {liveRecoveryBoardLabel(game)}
        </p>
        <p className="text-[11px] font-medium text-red-200/90">Your clock is running</p>
      </div>
      <Link
        href={`/game/${game.id}`}
        data-testid="live-game-recovery-cta"
        className="inline-flex min-h-[44px] shrink-0 touch-manipulation items-center justify-center rounded-lg border border-red-400/60 bg-red-600/30 px-4 py-2 text-sm font-bold text-red-50 transition hover:border-red-300/70 hover:bg-red-600/50"
      >
        {LIVE_GAME_RECOVERY_RETURN_LABEL}
      </Link>
    </div>
  );
}

/**
 * Self-loading variant for surfaces without an existing obligations snapshot
 * (mode rooms). Reuses `useLobbyUserObligations` — no new query shape.
 */
export function SelfLoadingLiveGameRecoveryBanner() {
  const { uid, freeLiveRaw } = useLobbyUserObligations();
  const rows = useMemo(() => selectSeatedLiveRecoveryRows(freeLiveRaw, uid), [freeLiveRaw, uid]);
  return <LiveGameRecoveryBanner rows={rows} uid={uid} />;
}
