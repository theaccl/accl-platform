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
 * Open public pairing — respects hub mode filter; join via mode room (secondary depth).
 */
export function FreePlayOpenPairingByMode({ activity, openSeatCounts, loading, modeFilter }: Props) {
  const modesToShow = PLAT_MODE_ORDER.filter((mode) => {
    if (modeFilter && mode !== modeFilter) return false;
    const openN = openSeatCounts?.[mode] ?? 0;
    return activity[mode] || openN > 0;
  });

  const filterLabel = modeFilter ? PLAT_MODE_LABELS[modeFilter] : null;

  return (
    <section
      className="relative z-[100] mb-4 rounded-xl border border-[#243244] bg-[#0f141c] px-4 py-3 sm:px-5"
      data-testid="free-open-pairing-by-mode"
      aria-label="Open public pairing"
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300/90">
        Open seats
      </h2>
      <p className="mt-1.5 text-xs leading-snug text-gray-500">
        {modeFilter ? (
          <>
            Joinable <strong className="text-gray-300">{filterLabel}</strong> seats waiting for an opponent.
          </>
        ) : (
          <>Joinable public seats — use mode filters above to focus on one clock family.</>
        )}
      </p>

      {modesToShow.length === 0 && !loading ? (
        <p className="mt-3 text-xs text-gray-500" data-testid="free-open-pairing-empty">
          No open public seats{modeFilter ? ` in ${filterLabel}` : ''} right now.
        </p>
      ) : (
        <ul className="relative z-[101] mt-3 flex flex-col gap-2 sm:max-w-md">
          {modesToShow.map((mode) => {
            const openN = openSeatCounts?.[mode] ?? 0;
            const openLabel = formatLobbyCountLabel(openN > 0 ? openN : activity[mode] ? 1 : 0);
            const modeLabel = PLAT_MODE_LABELS[mode];
            const modeRoomHref = `/free/lobby/${mode}#free-lobby-open-games-anchor`;
            return (
              <li key={mode} className="relative z-[102] min-h-0">
                <a
                  href={modeRoomHref}
                  onClick={(e) => forceDomNavigation(e, modeRoomHref)}
                  onPointerUp={(e) => {
                    if (e.pointerType === 'touch') {
                      window.location.assign(modeRoomHref);
                    }
                  }}
                  aria-label={`${modeLabel}: ${openLabel} open seat(s) — open games list`}
                  className={`flex min-h-[48px] w-full touch-manipulation items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left no-underline transition active:opacity-95 ${focusRing} border-emerald-500/55 bg-[#0f1a14] hover:border-emerald-400/70 hover:bg-[#102016]`}
                  data-testid={`free-open-pairing-link-${mode}`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.65)]"
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-gray-100">{modeLabel}</span>
                      <span className="block text-[10px] text-emerald-300/90">{openLabel} open seat(s)</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-emerald-300/95">
                    Join →
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
