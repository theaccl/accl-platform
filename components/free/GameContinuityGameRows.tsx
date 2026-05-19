'use client';

import Link from 'next/link';

import { gameDisplayTempoLabel } from '@/lib/gameDisplayLabel';
import {
  continuityRowActionLabel,
  type GameContinuityRow,
  isOpenSeatRow,
} from '@/lib/gameContinuityPresentation';

function isYourMove(g: GameContinuityRow, uid: string): boolean {
  const t = String(g.turn ?? '').trim().toLowerCase();
  if (t !== 'white' && t !== 'black') return false;
  if (!g.black_player_id) return false;
  if (t === 'white' && g.white_player_id === uid) return true;
  if (t === 'black' && g.black_player_id === uid) return true;
  return false;
}

type Props = {
  rows: GameContinuityRow[];
  uid: string | null;
  variant: 'live' | 'async';
  testIdPrefix: string;
  compact?: boolean;
};

export function GameContinuityGameRows({ rows, uid, variant, testIdPrefix, compact = false }: Props) {
  if (rows.length === 0) return null;

  const openSeats = rows.filter(isOpenSeatRow);
  const seated = rows.filter((g) => !isOpenSeatRow(g));

  return (
    <>
      {openSeats.length > 0 ? (
        <>
          <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 ${compact ? '' : ''}`}>
            {variant === 'live' ? 'Open live seats' : 'Open daily seats'}
          </p>
          <ul className={`mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 ${compact ? '' : ''}`}>
            {openSeats.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/game/${g.id}`}
                  className={
                    variant === 'live'
                      ? 'flex min-h-[48px] items-center justify-between rounded-lg border border-cyan-500/25 bg-[#0f1a24] px-3 py-2 text-sm text-gray-200 transition hover:border-cyan-400/45 hover:bg-[#122131]'
                      : 'flex min-h-[48px] items-center justify-between rounded-lg border border-violet-500/25 bg-[#14101f] px-3 py-2 text-sm text-gray-200 transition hover:border-violet-400/45 hover:bg-[#1a1528]'
                  }
                  data-testid={`${testIdPrefix}-open-${g.id}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-white">
                      {gameDisplayTempoLabel({ tempo: g.tempo, liveTimeControl: g.live_time_control ?? null })}
                    </span>
                    <span className="block text-[11px] text-gray-500">{continuityRowActionLabel(g)}</span>
                  </span>
                </Link>
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
            } ${openSeats.length > 0 ? 'mt-3' : compact ? 'mt-2' : 'mt-3'}`}
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
