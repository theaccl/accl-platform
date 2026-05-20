'use client';

import Link from 'next/link';

import { PLAT_MODE_LABELS, PLAT_MODE_ORDER, type PlatMode } from '@/lib/freePlayModeTimeControl';
import type { LobbyHubModeFilter } from '@/lib/lobbyModeFilter';
import type { FreePlayWatchListRow } from '@/lib/server/freePlayWatchList';

type Props = {
  loading: boolean;
  error: string | null;
  byMode: Record<PlatMode, FreePlayWatchListRow[]> | null;
  modeFilter: LobbyHubModeFilter;
};

function rowsForFilter(
  byMode: Record<PlatMode, FreePlayWatchListRow[]> | null,
  modeFilter: LobbyHubModeFilter,
): FreePlayWatchListRow[] {
  if (!byMode) return [];
  if (modeFilter) return byMode[modeFilter] ?? [];
  return PLAT_MODE_ORDER.flatMap((m) => byMode[m] ?? []);
}

/**
 * Filterable live-board spectate list (continuity without page-hopping).
 */
export function FreeLobbySpectatorFeed({ loading, error, byMode, modeFilter }: Props) {
  const rows = rowsForFilter(byMode, modeFilter);
  const filterLabel = modeFilter ? PLAT_MODE_LABELS[modeFilter] : 'All modes';

  return (
    <section
      id="watch-as-spectator-anchor"
      className="relative z-30 mb-4 rounded-xl border border-violet-500/30 bg-[#0c0e14] px-4 py-3 sm:px-5"
      data-testid="free-lobby-spectator-feed"
      aria-label="Watch as spectator"
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-300/90">
        Live boards · spectator
      </h2>
      <p className="mt-1.5 text-xs leading-snug text-gray-400">
        {modeFilter ? (
          <>
            Showing <strong className="text-violet-200/95">{filterLabel}</strong> only — read-only spectate links.
            Clear the mode filter above to see every mode.
          </>
        ) : (
          <>All modes — tap a mode filter chip to lock onto Bullet, Blitz, Rapid, or Daily activity.</>
        )}
      </p>
      {error ? (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="mt-3 text-xs text-gray-500" role="status">
          Loading live boards…
        </p>
      ) : null}
      {!loading && rows.length === 0 ? (
        <p className="mt-3 text-xs text-gray-500" data-testid="free-lobby-spectator-feed-empty">
          No live boards to watch{modeFilter ? ` in ${filterLabel}` : ''} right now.
        </p>
      ) : null}
      {!loading && rows.length > 0 ? (
        <ul className="mt-3 flex max-h-[280px] flex-col gap-2 overflow-y-auto pr-1">
          {rows.map((g) => (
            <li key={g.id}>
              <Link
                href={`/game/${g.id}?spectate=1`}
                className="flex flex-col rounded-lg border border-violet-500/25 bg-[#111018] px-3 py-2.5 text-left text-sm text-gray-200 transition hover:border-violet-400/45 hover:bg-[#16101f]"
                data-testid={`free-watch-spectate-${g.id}`}
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="rounded border border-violet-500/30 bg-violet-950/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200/90">
                    {PLAT_MODE_LABELS[g.mode]}
                  </span>
                  <span className="font-medium text-white">
                    {g.whiteLabel} <span className="text-gray-500">vs</span> {g.blackLabel}
                  </span>
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
