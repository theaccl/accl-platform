'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { nexusModuleHeadingClass } from '@/components/nexus/NexusHeader';
import { nexusPrestigeCard } from '@/components/nexus/nexusShellTheme';
import { PLAT_MODE_LABELS, PLAT_MODE_ORDER, type PlatMode } from '@/lib/freePlayModeTimeControl';
import type { NexusOperationalGameRow } from '@/lib/nexus/getUserOperationalGames';
import { groupOperationalGamesByMode } from '@/lib/nexus/getUserOperationalGames';

function formatClock(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms >= 86_400_000) return `${Math.ceil(ms / 86_400_000)}d`;
  const sec = Math.max(0, Math.ceil(ms / 1000));
  if (sec >= 3600) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  if (sec >= 60) return `${Math.floor(sec / 60)}m`;
  return `${sec}s`;
}

function GameRow({ row }: { row: NexusOperationalGameRow }) {
  return (
    <li>
      <Link
        href={row.href}
        className={`flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left transition hover:bg-[#1a2438] ${
          row.isYourMove
            ? 'border-emerald-500/45 bg-emerald-950/25'
            : row.isTournament
              ? 'border-amber-500/35 bg-amber-950/15'
              : 'border-white/[0.08] bg-[#131c2c]'
        }`}
        data-testid={`nexus-operational-game-${row.id}`}
      >
        <span className="text-sm font-semibold text-gray-100">
          {row.isYourMove ? 'Your move' : row.isTournament ? 'Tournament board' : 'Active game'}
          <span className="font-normal text-gray-500"> · vs {row.opponentLabel}</span>
        </span>
        <span className="text-[11px] text-gray-500">
          {row.tempoLabel}
          {row.isLive && row.clockRemainingMs != null ? ` · ${formatClock(row.clockRemainingMs)} on clock` : ''}
          {!row.isLive ? ' · daily/async' : ''}
        </span>
      </Link>
    </li>
  );
}

export default function NexusOpenGamesColumn({
  games,
  isLoggedIn,
}: {
  games: NexusOperationalGameRow[];
  isLoggedIn: boolean;
}) {
  const [modeFilter, setModeFilter] = useState<PlatMode | null>(null);
  const byMode = useMemo(() => groupOperationalGamesByMode(games), [games]);
  const populatedModes = PLAT_MODE_ORDER.filter((m) => (byMode[m]?.length ?? 0) > 0);

  if (!isLoggedIn || games.length === 0) {
    return null;
  }

  const visibleRows =
    modeFilter && byMode[modeFilter] ? byMode[modeFilter]! : games;
  const showModeLanes = populatedModes.length > 0;

  return (
    <section
      className={`${nexusPrestigeCard} flex flex-col p-4 sm:p-5`}
      aria-label="Your active games"
      data-testid="nexus-operational-games"
    >
      <h2 className={nexusModuleHeadingClass}>Your active games</h2>
      <p className="mt-1 text-xs leading-snug text-gray-500">
        Operational obligations only — your move first, then lowest clock. Live boards above async-style games.
      </p>

      {showModeLanes ? (
        <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Filter by mode">
          <button
            type="button"
            role="tab"
            aria-selected={modeFilter === null}
            onClick={() => setModeFilter(null)}
            className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
              modeFilter === null
                ? 'border-sky-500/50 bg-sky-950/40 text-sky-100'
                : 'border-white/10 bg-[#131c2c] text-gray-400'
            }`}
            data-testid="nexus-operational-filter-all"
          >
            All modes ({games.length})
          </button>
          {populatedModes.map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={modeFilter === mode}
              onClick={() => setModeFilter(modeFilter === mode ? null : mode)}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
                modeFilter === mode
                  ? 'border-sky-500/50 bg-sky-950/40 text-sky-100'
                  : 'border-white/10 bg-[#131c2c] text-gray-400'
              }`}
              data-testid={`nexus-operational-filter-${mode}`}
            >
              {PLAT_MODE_LABELS[mode]} ({byMode[mode]!.length})
            </button>
          ))}
        </div>
      ) : null}

      <ul className="mt-3 flex flex-col gap-2">
        {visibleRows.map((row) => (
          <GameRow key={row.id} row={row} />
        ))}
      </ul>

      <p className="mt-3 text-[11px] text-gray-600">
        <Link href="/free/active" className="text-sky-300 underline-offset-2 hover:underline">
          All your games
        </Link>
        {' · '}
        <Link href="/free/lobby" className="text-gray-400 underline-offset-2 hover:underline">
          Free Play Lobby
        </Link>
      </p>
    </section>
  );
}
