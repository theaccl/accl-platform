'use client';

import { PLAT_MODE_LABELS, PLAT_MODE_ORDER, type PlatMode } from '@/lib/freePlayModeTimeControl';
import { formatLobbyCountLabel } from '@/lib/formatLobbyCountLabel';
import { forceDomNavigation } from '@/lib/forceDomNavigation';
import type { FreePlayWatchListRow } from '@/lib/server/freePlayWatchList';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f141c]';

export type FreePlayWatchSpectatorHubPayload = {
  byMode: Record<PlatMode, FreePlayWatchListRow[]>;
  watchActivity: Record<PlatMode, boolean>;
} | null;

type Props = {
  loading: boolean;
  error: string | null;
  data: FreePlayWatchSpectatorHubPayload;
  /** Hub: list only modes that currently have a live board to watch. */
  liveBoardsOnly?: boolean;
};

/**
 * Watch as spectator — read-only live boards per mode.
 */
export function FreePlayWatchSpectatorByMode({ loading, error, data, liveBoardsOnly = false }: Props) {
  const modesWithLive = PLAT_MODE_ORDER.filter((mode) => (data?.byMode[mode]?.length ?? 0) > 0);
  const modesToShow = liveBoardsOnly ? modesWithLive : PLAT_MODE_ORDER;

  return (
    <section
      id="watch-as-spectator-anchor"
      className="relative z-30 mb-4 rounded-xl border border-violet-500/30 bg-[#0c0e14] px-4 py-3 sm:px-5"
      data-testid="free-watch-spectator-by-mode"
      aria-label="Watch as spectator"
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-300/90">Watch as spectator</h2>
      <p className="mt-1.5 text-xs leading-snug text-gray-400">
        Read-only live boards — spectate without joining the queue.
      </p>
      {error ? (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {modesToShow.length === 0 && !loading ? (
        <p className="mt-3 text-xs text-gray-500" data-testid="free-watch-spectator-empty">
          No live boards to watch right now.
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {modesToShow.map((mode) => {
            const rows = data?.byMode[mode] ?? [];
            const n = rows.length;
            const countLabel = formatLobbyCountLabel(n);
            const clockKeys = [...new Set(rows.map((r) => r.liveTimeControlKey).filter(Boolean))].sort();
            const clockQs = clockKeys.length === 1 ? `?clock=${encodeURIComponent(clockKeys[0]!)}` : '';
            const href = `/free/lobby/${mode}${clockQs}#watch-as-spectator-anchor`;
            return (
              <li key={mode} className="min-h-0">
                <a
                  href={href}
                  onClick={(e) => forceDomNavigation(e, href)}
                  aria-label={`${PLAT_MODE_LABELS[mode]}: ${countLabel} live game(s) — spectate`}
                  className={`flex min-h-[52px] w-full touch-manipulation flex-col justify-between gap-1 rounded-lg border px-2.5 py-2 text-left no-underline transition active:opacity-95 [-webkit-tap-highlight-color:rgba(167,139,250,0.25)] ${focusRing} border-violet-500/50 bg-[#140f1c] shadow-[0_0_0_1px_rgba(139,92,246,0.12)] hover:border-violet-400/60 hover:bg-[#1a1424]`}
                  data-testid={`free-watch-link-${mode}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,0.55)]"
                      aria-hidden
                    />
                    <span className="min-w-0 text-[13px] font-semibold text-gray-100">{PLAT_MODE_LABELS[mode]}</span>
                  </div>
                  <span className="text-center text-[11px] font-semibold text-violet-200/95">
                    Watch ({countLabel})
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
      {loading ? (
        <p className="mt-2 text-[11px] text-gray-600" role="status">
          Loading watch list…
        </p>
      ) : null}
    </section>
  );
}
