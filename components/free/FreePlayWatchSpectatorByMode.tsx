'use client';

import { PLAT_MODE_LABELS, PLAT_MODE_ORDER, type PlatMode } from '@/lib/freePlayModeTimeControl';
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
};

/**
 * Hub: full-tile links to each mode’s watch list (same pattern as Open Public Pairing).
 */
export function FreePlayWatchSpectatorByMode({ loading, error, data }: Props) {
  return (
    <section
      id="watch-as-spectator-anchor"
      className="relative z-30 mb-4 rounded-xl border-2 border-violet-500/35 bg-[#0c0e14] px-4 py-3 shadow-[0_0_0_1px_rgba(139,92,246,0.15)] sm:px-5"
      data-testid="free-watch-spectator-by-mode"
      aria-label="Watch live games as spectator"
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-300/90">Watch as spectator</h2>
      <p className="mt-1.5 text-xs leading-snug text-gray-400">
        <strong className="text-violet-200/95">Tap a mode</strong> to open that room on the watch list (read-only boards).{' '}
        <strong className="text-gray-500">Violet dot</strong> = at least one live game. Also use the sticky{' '}
        <strong className="text-gray-300">Watch live</strong> button at the bottom of the screen.
      </p>
      {error ? (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PLAT_MODE_ORDER.map((mode) => {
          const rows = data?.byMode[mode] ?? [];
          const on = rows.length > 0;
          const clockKeys = [...new Set(rows.map((r) => r.liveTimeControlKey).filter(Boolean))].sort();
          const clockQs = clockKeys.length === 1 ? `?clock=${encodeURIComponent(clockKeys[0]!)}` : '';
          const href = `/free/lobby/${mode}${clockQs}#watch-as-spectator-anchor`;
          return (
            <li key={mode} className="min-h-0">
              <a
                href={href}
                onClick={(e) => forceDomNavigation(e, href)}
                aria-label={
                  on
                    ? `${PLAT_MODE_LABELS[mode]}: ${rows.length} live game(s) — open watch list`
                    : `${PLAT_MODE_LABELS[mode]} mode — open watch / spectate area`
                }
                className={`flex min-h-[52px] w-full touch-manipulation flex-col justify-between gap-1 rounded-lg border px-2.5 py-2 text-left no-underline transition active:opacity-95 [-webkit-tap-highlight-color:rgba(167,139,250,0.25)] ${focusRing} ${
                  on
                    ? 'border-violet-500/50 bg-[#140f1c] shadow-[0_0_0_1px_rgba(139,92,246,0.12)] hover:border-violet-400/60 hover:bg-[#1a1424]'
                    : 'border-[#2a3442] bg-[#111723] hover:border-violet-500/30 hover:bg-[#141c2a]'
                }`}
                data-testid={`free-watch-link-${mode}`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${on ? 'bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,0.55)]' : 'bg-gray-600'}`}
                    aria-hidden
                  />
                  <span className="min-w-0 text-[13px] font-semibold text-gray-100">{PLAT_MODE_LABELS[mode]}</span>
                </div>
                <span className={`text-center text-[11px] font-semibold ${on ? 'text-violet-200/95' : 'text-gray-500'}`}>
                  {on ? `Watch (${rows.length})` : 'Open watch'}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
      {loading ? (
        <p className="mt-2 text-[11px] text-gray-600" role="status">
          Loading watch list…
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-gray-600">
          <span className="text-violet-400/90">●</span> = live game in that mode — tap the tile or use bottom{' '}
          <span className="font-medium text-gray-400">Watch live</span>.
        </p>
      )}
    </section>
  );
}
