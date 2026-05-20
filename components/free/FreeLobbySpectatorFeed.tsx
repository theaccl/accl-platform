'use client';

import { PLAT_MODE_LABELS, PLAT_MODE_ORDER, type PlatMode } from '@/lib/freePlayModeTimeControl';
import { formatLobbyCountLabel } from '@/lib/formatLobbyCountLabel';
import { forceDomNavigation } from '@/lib/forceDomNavigation';
import type { LobbyHubModeFilter } from '@/lib/lobbyModeFilter';
import type { FreePlayWatchListRow } from '@/lib/server/freePlayWatchList';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f141c]';

type Props = {
  loading: boolean;
  error: string | null;
  byMode: Record<PlatMode, FreePlayWatchListRow[]> | null;
  modeFilter: LobbyHubModeFilter;
};

/**
 * Watch as spectator — mode tiles (violet), mirrors open-seat tile layout.
 */
export function FreeLobbySpectatorFeed({ loading, error, byMode, modeFilter }: Props) {
  const modesToShow = PLAT_MODE_ORDER.filter((mode) => !modeFilter || mode === modeFilter);
  const filterLabel = modeFilter ? PLAT_MODE_LABELS[modeFilter] : null;
  const anyLive = modesToShow.some((mode) => (byMode?.[mode]?.length ?? 0) > 0);

  return (
    <section
      id="watch-as-spectator-anchor"
      className="relative z-30 mb-4 rounded-xl border border-violet-500/35 bg-[#0c0e14] px-4 py-3 shadow-[0_0_0_1px_rgba(139,92,246,0.1)] sm:px-5"
      data-testid="free-lobby-spectator-feed"
      aria-label="Watch as spectator"
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-300/90">
        Watch as spectator
      </h2>
      <p className="mt-1.5 text-xs leading-snug text-gray-400">
        {modeFilter ? (
          <>
            <strong className="text-violet-200/95">{filterLabel}</strong> live boards — violet dot = games in
            session. Tap a tile to open that mode&apos;s watch list.
          </>
        ) : (
          <>
            <strong className="text-violet-300/90">Violet dot</strong> = live boards you can watch. Tap a mode tile for
            its spectate list (read-only).
          </>
        )}
      </p>
      {error ? (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      {!loading && !anyLive ? (
        <p className="mt-3 text-xs text-gray-500" data-testid="free-lobby-spectator-feed-empty">
          No live boards to watch{modeFilter ? ` in ${filterLabel}` : ''} right now.
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {modesToShow.map((mode) => {
            const rows = byMode?.[mode] ?? [];
            const n = rows.length;
            const on = n > 0;
            const countLabel = formatLobbyCountLabel(n);
            const clockKeys = [...new Set(rows.map((r) => r.liveTimeControlKey).filter(Boolean))].sort();
            const clockQs = clockKeys.length === 1 ? `?clock=${encodeURIComponent(clockKeys[0]!)}` : '';
            const href = `/free/lobby/${mode}${clockQs}#watch-as-spectator-anchor`;
            const modeLabel = PLAT_MODE_LABELS[mode];
            return (
              <li key={mode} className="min-h-0">
                <a
                  href={href}
                  onClick={(e) => forceDomNavigation(e, href)}
                  onPointerUp={(e) => {
                    if (e.pointerType === 'touch') window.location.assign(href);
                  }}
                  aria-label={
                    on
                      ? `${modeLabel}: ${countLabel} live game(s) — open watch list`
                      : `${modeLabel}: no live boards — open watch area`
                  }
                  className={`flex min-h-[56px] w-full touch-manipulation flex-col justify-between gap-1.5 rounded-lg border px-2.5 py-2.5 text-left no-underline transition active:opacity-95 [-webkit-tap-highlight-color:rgba(167,139,250,0.25)] ${focusRing} ${
                    on
                      ? 'border-violet-500/50 bg-[#140f1c] shadow-[0_0_0_1px_rgba(139,92,246,0.12)] hover:border-violet-400/60 hover:bg-[#1a1424]'
                      : 'border-[#2a3442] bg-[#111723] hover:border-violet-500/30 hover:bg-[#14101f]'
                  }`}
                  data-testid={`free-watch-link-${mode}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        on
                          ? 'bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,0.55)]'
                          : 'bg-gray-600'
                      }`}
                      aria-hidden
                    />
                    <span className="min-w-0 text-[13px] font-semibold text-gray-100">{modeLabel}</span>
                  </div>
                  <span
                    className={`text-center text-[11px] font-semibold ${on ? 'text-violet-200/95' : 'text-gray-500'}`}
                  >
                    {on ? `Watch (${countLabel})` : 'No live games'}
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
