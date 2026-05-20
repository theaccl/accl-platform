'use client';

import { PLAT_MODE_LABELS, PLAT_MODE_ORDER, type PlatMode } from '@/lib/freePlayModeTimeControl';
import { formatLobbyCountLabel } from '@/lib/formatLobbyCountLabel';
import { forceDomNavigation } from '@/lib/forceDomNavigation';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f141c]';

type Props = {
  activity: Record<PlatMode, boolean>;
  /** Per-mode open-seat counts for hub badges (cap display in labels via formatLobbyCountLabel). */
  openSeatCounts?: Record<PlatMode, number>;
  loading: boolean;
  /** Hub: show only modes with a joinable open seat (no dead tiles). */
  activeSeatsOnly?: boolean;
};

/**
 * Open public pairing — lit tiles jump to Open Games in that mode room.
 */
export function FreePlayOpenPairingByMode({
  activity,
  openSeatCounts,
  loading,
  activeSeatsOnly = false,
}: Props) {
  const modesToShow = PLAT_MODE_ORDER.filter((mode) => {
    if (!activeSeatsOnly) return true;
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
        Joinable seats only — tap a lit tile to open <strong className="text-gray-300">Open Games</strong> in that mode.
        No open seats? Collapse mode rooms below or pick a mode for chat and queue.
      </p>

      {modesToShow.length === 0 && !loading ? (
        <p className="mt-3 text-xs text-gray-500" data-testid="free-open-pairing-empty">
          No open public seats right now. Post from a mode room or check back shortly.
        </p>
      ) : (
        <ul className="relative z-[101] mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {modesToShow.map((mode) => {
            const on = activity[mode];
            const openN = openSeatCounts?.[mode] ?? 0;
            const openLabel = formatLobbyCountLabel(openN > 0 ? openN : on ? 1 : 0);
            const modeLabel = PLAT_MODE_LABELS[mode];
            const modeRoomHref = `/free/lobby/${mode}#free-lobby-open-games-anchor`;
            const shortcutLabel = `${modeLabel}: open seat waiting — go to Open Games now`;
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
                  aria-label={shortcutLabel}
                  className={`flex min-h-[48px] w-full touch-manipulation flex-col rounded-lg border px-2.5 py-2 text-left font-sans text-inherit no-underline shadow-sm transition active:opacity-95 [-webkit-tap-highlight-color:rgba(16,185,129,0.25)] ${focusRing} border-emerald-500/55 bg-[#0f1a14] shadow-[0_0_0_1px_rgba(16,185,129,0.18)] hover:border-emerald-400/70 hover:bg-[#102016]`}
                  title={`${modeLabel}: tap to open Open Games`}
                  data-testid={`free-open-pairing-link-${mode}`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.65)]"
                      aria-hidden
                    />
                    <span className="min-w-0 text-[13px] font-semibold text-gray-100">{modeLabel}</span>
                  </span>
                  <span className="mt-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300/95">
                    Open games ({openLabel}) →
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
    </section>
  );
}
