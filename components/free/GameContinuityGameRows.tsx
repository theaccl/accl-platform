'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';

import { gameDisplayTempoLabel } from '@/lib/gameDisplayLabel';
import { openSeatExactControlDisplayLabel } from '@/lib/freeLobbyOpenSeatFilters';
import {
  continuityRowActionLabel,
  NEUTRAL_OPEN_SEAT_CANCEL_FINISH,
  type GameContinuityRow,
  isLiveContinuityGame,
  isOpenSeatRow,
} from '@/lib/gameContinuityPresentation';
import { supabase } from '@/lib/supabaseClient';

function isYourMove(g: GameContinuityRow, uid: string): boolean {
  const t = String(g.turn ?? '').trim().toLowerCase();
  if (t !== 'white' && t !== 'black') return false;
  if (!g.black_player_id) return false;
  if (t === 'white' && g.white_player_id === uid) return true;
  if (t === 'black' && g.black_player_id === uid) return true;
  return false;
}

function openSeatLaneLabel(g: GameContinuityRow): string {
  return openSeatExactControlDisplayLabel(g);
}

type OpenLiveSeatInlineCardProps = {
  g: GameContinuityRow;
  testIdPrefix: string;
  onCancelled?: (gameId: string) => void;
};

/** Expandable inline management for an unmatched live open seat (no whole-row board navigation). */
function OpenLiveSeatInlineCard({ g, testIdPrefix, onCancelled }: OpenLiveSeatInlineCardProps) {
  const [cancelling, setCancelling] = useState(false);
  const [cancelErr, setCancelErr] = useState<string | null>(null);

  const handleCancel = useCallback(async () => {
    if (cancelling) return;
    setCancelling(true);
    setCancelErr(null);
    const { error } = await supabase.rpc('finish_game', {
      p_game_id: g.id,
      ...NEUTRAL_OPEN_SEAT_CANCEL_FINISH,
    });
    setCancelling(false);
    if (error) {
      setCancelErr(error.message);
      return;
    }
    onCancelled?.(g.id);
  }, [cancelling, g.id, onCancelled]);

  return (
    <details
      className="rounded-lg border border-cyan-500/25 bg-[#0f1a24] open:border-cyan-400/45"
      data-testid={`${testIdPrefix}-open-inline-${g.id}`}
    >
      <summary className="flex min-h-[48px] cursor-pointer list-none items-center justify-between px-3 py-2 text-sm text-gray-200 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 pr-2">
          <span className="block truncate font-semibold text-white">{openSeatLaneLabel(g)}</span>
          <span className="block text-[11px] text-gray-500">{continuityRowActionLabel(g)}</span>
        </span>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-cyan-400/80">Manage</span>
      </summary>
      <div className="flex flex-col gap-2 border-t border-cyan-500/15 px-3 py-3">
        <Link
          href={`/game/${g.id}`}
          data-testid={`${testIdPrefix}-open-return-${g.id}`}
          className="inline-flex min-h-[44px] touch-manipulation items-center justify-center rounded-lg border border-cyan-500/40 bg-cyan-950/40 px-3 py-2 text-sm font-semibold text-cyan-100 transition hover:border-cyan-400/60 hover:bg-cyan-900/50"
        >
          Return to waiting seat
        </Link>
        <button
          type="button"
          data-testid={`${testIdPrefix}-open-cancel-${g.id}`}
          disabled={cancelling}
          onClick={() => void handleCancel()}
          className="inline-flex min-h-[44px] touch-manipulation items-center justify-center rounded-lg border border-red-500/35 bg-red-950/30 px-3 py-2 text-sm font-semibold text-red-200 transition hover:border-red-400/50 hover:bg-red-900/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {cancelling ? 'Cancelling…' : 'Cancel open seat'}
        </button>
        {cancelErr ? <p className="text-[11px] text-red-300">{cancelErr}</p> : null}
      </div>
    </details>
  );
}

type Props = {
  rows: GameContinuityRow[];
  uid: string | null;
  variant: 'live' | 'async';
  testIdPrefix: string;
  compact?: boolean;
  /** When set, inline live open-seat cancel removes the row from the parent list. */
  onOpenSeatCancelled?: (gameId: string) => void;
};

export function GameContinuityGameRows({
  rows,
  uid,
  variant,
  testIdPrefix,
  compact = false,
  onOpenSeatCancelled,
}: Props) {
  if (rows.length === 0) return null;

  const openSeats = rows.filter(isOpenSeatRow);
  const seated = rows.filter((g) => !isOpenSeatRow(g));
  const inlineLiveOpenSeats = variant === 'live';

  return (
    <>
      {openSeats.length > 0 ? (
        <>
          {!inlineLiveOpenSeats ? (
            <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 ${compact ? '' : ''}`}>
              Open daily seats
            </p>
          ) : null}
          <ul className={`mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 ${compact ? '' : ''}`}>
            {openSeats.map((g) => (
              <li key={g.id}>
                {inlineLiveOpenSeats ? (
                  <OpenLiveSeatInlineCard
                    g={g}
                    testIdPrefix={testIdPrefix}
                    onCancelled={onOpenSeatCancelled}
                  />
                ) : (
                  <Link
                    href={`/game/${g.id}`}
                    className="flex min-h-[48px] items-center justify-between rounded-lg border border-violet-500/25 bg-[#14101f] px-3 py-2 text-sm text-gray-200 transition hover:border-violet-400/45 hover:bg-[#1a1528]"
                    data-testid={`${testIdPrefix}-open-${g.id}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-white">
                        {isLiveContinuityGame(g) ? openSeatExactControlDisplayLabel(g) : gameDisplayTempoLabel({ tempo: g.tempo, liveTimeControl: g.live_time_control ?? null })}
                      </span>
                      <span className="block text-[11px] text-gray-500">{continuityRowActionLabel(g)}</span>
                    </span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {seated.length > 0 ? (
        <>
          <p
            className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
              variant === 'live' ? 'text-sky-300/85' : 'text-violet-300/80'
            } ${openSeats.length > 0 && !inlineLiveOpenSeats ? 'mt-3' : compact ? 'mt-2' : 'mt-3'}`}
          >
            {variant === 'live' ? 'Live boards' : 'Daily boards'}
          </p>
          <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {seated.map((g) => {
              const mine = uid ? isYourMove(g, uid) : false;
              return (
                <li key={g.id}>
                  <Link
                    href={`/game/${g.id}`}
                    className="flex min-h-[48px] items-center justify-between rounded-lg border border-white/[0.1] bg-[#111723] px-3 py-2 text-sm text-gray-200 transition hover:border-sky-500/45 hover:bg-[#141c2a]"
                    data-testid={`${testIdPrefix}-seated-${g.id}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-white">
                        {gameDisplayTempoLabel({ tempo: g.tempo, liveTimeControl: g.live_time_control ?? null })}
                      </span>
                      <span className="block text-[11px] text-gray-500">{continuityRowActionLabel(g)}</span>
                    </span>
                    {mine ? (
                      <span className="ml-2 shrink-0 rounded-full border border-emerald-500/40 bg-emerald-950/35 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                        Your move
                      </span>
                    ) : (
                      <span className="ml-2 shrink-0 rounded-full border border-white/10 bg-[#0d131c] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                        Waiting
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </>
  );
}
