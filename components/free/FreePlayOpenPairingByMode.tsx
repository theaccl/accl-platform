'use client';

import Link from 'next/link';

import { PLAT_MODE_LABELS, PLAT_MODE_ORDER, type PlatMode } from '@/lib/freePlayModeTimeControl';
import { formatLobbyCountLabel } from '@/lib/formatLobbyCountLabel';
import { forceDomNavigation } from '@/lib/forceDomNavigation';
import type { LobbyHubModeFilter } from '@/lib/lobbyModeFilter';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f141c]';

type Props = {
  activity: Record<PlatMode, boolean>;
  openSeatCounts?: Record<PlatMode, number>;
  loading: boolean;
  modeFilter: LobbyHubModeFilter;
};

/**
 * Open public pairing — mode tiles (emerald), mirrors spectator tile layout.
 */
export function FreePlayOpenPairingByMode({ activity, openSeatCounts, loading, modeFilter }: Props) {
  const modesToShow = PLAT_MODE_ORDER.filter((mode) => !modeFilter || mode === modeFilter);
  const filterLabel = modeFilter ? PLAT_MODE_LABELS[modeFilter] : null;
  const anyOpen = modesToShow.some((mode) => {
    const openN = openSeatCounts?.[mode] ?? 0;
    return activity[mode] || openN > 0;
  });

  return (
    <section
      className="relative z-[100] mb-4 rounded-xl border border-[#243244] bg-[#0f141c] px-4 py-3 sm:px-5"
      data-testid="free-open-pairing-by-mode"
      aria-label="Open public pairing"
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300/90">
        Open public pairing
      </h2>
      <p className="mt-1.5 text-xs leading-snug text-gray-500">
        {modeFilter ? (
          <>
            <strong className="text-emerald-300/90">Green dot</strong> = joinable{' '}
            <strong className="text-gray-300">{filterLabel}</strong> seats. Tap a tile to open Open Games.
          </>
        ) : (
          <>
            <strong className="text-emerald-400/90">Green dot</strong> = someone waiting in that mode. Tap a tile to
            jump to Open Games.
          </>
        )}
      </p>

      {!loading && !anyOpen ? (
        <p className="mt-3 text-xs text-gray-500" data-testid="free-open-pairing-empty">
          No open public seats{modeFilter ? ` in ${filterLabel}` : ''} right now.
        </p>
      ) : (
        <ul className="relative z-[101] mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {modesToShow.map((mode) => {
            const openN = openSeatCounts?.[mode] ?? 0;
            const on = activity[mode] || openN > 0;
            const openLabel = formatLobbyCountLabel(openN > 0 ? openN : on ? 1 : 0);
            const modeLabel = PLAT_MODE_LABELS[mode];
            const modeRoomHref = `/free/lobby/${mode}#free-lobby-open-games-anchor`;
            return (
              <li key={mode} className="relative z-[102] min-h-0">
                <a
                  href={modeRoomHref}
                  onClick={(e) => forceDomNavigation(e, modeRoomHref)}
                  onPointerUp={(e) => {
                    if (e.pointerType === 'touch') window.location.assign(modeRoomHref);
                  }}
                  aria-label={
                    on
                      ? `${modeLabel}: ${openLabel} open seat(s) — open games list`
                      : `${modeLabel}: no open seats — open mode room`
                  }
                  className={`flex min-h-[56px] w-full touch-manipulation flex-col justify-between gap-1.5 rounded-lg border px-2.5 py-2.5 text-left no-underline transition active:opacity-95 [-webkit-tap-highlight-color:rgba(16,185,129,0.25)] ${focusRing} ${
                    on
                      ? 'border-emerald-500/55 bg-[#0f1a14] shadow-[0_0_0_1px_rgba(16,185,129,0.18)] hover:border-emerald-400/70 hover:bg-[#102016]'
                      : 'border-[#2a3442] bg-[#111723] hover:border-emerald-500/35 hover:bg-[#141c2a]'
                  }`}
                  data-testid={`free-open-pairing-link-${mode}`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        on
                          ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.65)]'
                          : 'bg-gray-600'
                      }`}
                      aria-hidden
                    />
                    <span className="min-w-0 text-[13px] font-semibold text-gray-100">{modeLabel}</span>
                  </div>
                  <span
                    className={`text-center text-[11px] font-semibold ${on ? 'text-emerald-300/95' : 'text-gray-500'}`}
                  >
                    {on ? `Open (${openLabel})` : 'No open seats'}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}

      {loading ? (
        <p className="mt-2 text-[11px] text-gray-600" role="status">
          Checking open seats…
        </p>
      ) : null}
      {modeFilter ? (
        <p className="mt-2 text-[11px] text-gray-600">
          Need chat or post a seat?{' '}
          <Link href={`/free/lobby/${modeFilter}`} className="font-semibold text-sky-400 hover:text-sky-300">
            {filterLabel} mode room →
          </Link>
        </p>
      ) : null}
    </section>
  );
}
