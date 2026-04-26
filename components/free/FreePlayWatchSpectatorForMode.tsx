'use client';

import Link from 'next/link';

import { useFreePlayWatchList } from '@/hooks/useFreePlayWatchList';
import {
  PLAT_MODE_LABELS,
  coercePlatTimeForMode,
  isValidPlatTimeForMode,
  type PlatMode,
} from '@/lib/freePlayModeTimeControl';
import { canonicalLiveTimeControlForInsert } from '@/lib/gameTimeControl';
import type { FreePlayWatchListRow } from '@/lib/server/freePlayWatchList';

type Props = {
  mode: PlatMode;
  viewerEcosystem?: 'adult' | 'k12';
  /** When set, only list games matching this room clock (same token as Open Games / create-find). */
  selectedClock?: string;
};

function rowsForSelectedClock(
  mode: PlatMode,
  selectedClock: string | undefined,
  rows: FreePlayWatchListRow[]
): FreePlayWatchListRow[] {
  const raw = String(selectedClock ?? '').trim();
  if (!raw || !isValidPlatTimeForMode(mode, raw)) return rows;
  const coerced = coercePlatTimeForMode(mode, raw);
  const tempo = mode === 'daily' ? 'daily' : 'live';
  const want = canonicalLiveTimeControlForInsert(tempo, coerced) ?? coerced.trim().toLowerCase();
  return rows.filter((r) => r.liveTimeControlKey === want);
}

/**
 * Mode room: list live games in this PLAT bucket with spectate-only links.
 */
export function FreePlayWatchSpectatorForMode({ mode, viewerEcosystem = 'adult', selectedClock }: Props) {
  const { data, loading, error } = useFreePlayWatchList(viewerEcosystem);
  const rows = rowsForSelectedClock(mode, selectedClock, data?.byMode[mode] ?? []);
  const label = PLAT_MODE_LABELS[mode];

  return (
    <section
      id="watch-as-spectator-anchor"
      className="rounded-2xl border-2 border-violet-400/40 bg-gradient-to-b from-[#14101c]/95 to-[#0c0e12]/95 p-4 shadow-[0_0_0_1px_rgba(167,139,250,0.12)] ring-1 ring-violet-400/25 sm:p-5"
      data-testid={`free-watch-spectator-mode-${mode}`}
      aria-label={`Watch live ${label} games`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-300/85">Watch live</p>
          <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">Spectator ({label})</h2>
        </div>
        <span className="shrink-0 rounded-md border border-violet-500/35 bg-violet-950/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-violet-200/95">
          Games in session
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-gray-400">
        <strong className="text-gray-300">Live boards only</strong> — games already in progress (both players seated).
        Watch-only; you do not join as a player here. For open seats waiting for an opponent, use{' '}
        <strong className="text-gray-300">Open Games</strong> above.
      </p>
      <p className="mt-2 text-xs text-gray-500">
        <Link
          href="/free/lobby#watch-as-spectator-anchor"
          className="font-semibold text-violet-300 underline-offset-2 hover:text-violet-200 hover:underline"
        >
          Watch lobby hub (all modes)
        </Link>
      </p>
      {loading ? <p className="mt-3 text-sm text-gray-500">Loading…</p> : null}
      {error ? (
        <p className="mt-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      {!loading && !error && rows.length === 0 ? (
        <div className="mt-3 space-y-2 rounded-lg border border-violet-500/20 bg-violet-950/15 px-3 py-3">
          <p className="text-sm text-gray-300">
            No live boards in <strong className="text-white">{label}</strong> match our filters right now — but live
            games can still exist in other clocks or modes.
          </p>
          <p className="text-xs text-gray-500">
            <Link
              href="/free/lobby#watch-as-spectator-anchor"
              className="font-semibold text-violet-300 underline-offset-2 hover:text-violet-200 hover:underline"
            >
              Lobby hub: Watch as spectator (all modes)
            </Link>
          </p>
        </div>
      ) : null}
      {!loading && rows.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map((g) => (
            <li key={g.id}>
              <Link
                href={`/game/${g.id}?spectate=1`}
                className="flex flex-col rounded-lg border border-violet-500/25 bg-[#111018] px-3 py-2.5 text-left text-sm text-gray-200 transition hover:border-violet-400/45 hover:bg-[#16101f]"
                data-testid={`free-watch-spectate-${g.id}`}
              >
                <span className="font-medium text-white">
                  {g.whiteLabel} <span className="text-gray-500">vs</span> {g.blackLabel}
                </span>
                <span className="text-[12px] text-gray-500">{g.timeLabel} · spectate</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
