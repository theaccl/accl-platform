'use client';

import {
  formatModeRoomOpenClockTile,
  formatModeRoomWatchClockTile,
  type OpenSeatClockLaneCounts,
} from '@/lib/lobbyModeClockActivity';
import { platTimeOptionsForMode, type PlatMode } from '@/lib/freePlayModeTimeControl';

const emeraldFocus =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a1018]';
const violetFocus =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0e12]';

type Variant = 'open' | 'watch';

type Props = {
  variant: Variant;
  mode: PlatMode;
  selectedClock: string;
  onSelectClock: (clockId: string) => void;
  countsByClock: Record<string, number> | Record<string, OpenSeatClockLaneCounts>;
  loading?: boolean;
};

/**
 * Mode room: one tile per legal clock — emerald (open seats) or violet (live boards).
 */
export function ModeRoomClockActivityRow({
  variant,
  mode,
  selectedClock,
  onSelectClock,
  countsByClock,
  loading = false,
}: Props) {
  const options = platTimeOptionsForMode(mode);
  const isOpen = variant === 'open';
  const focusRing = isOpen ? emeraldFocus : violetFocus;
  const laneCount = (id: string): OpenSeatClockLaneCounts | null => {
    const raw = countsByClock[id];
    if (raw == null) return null;
    if (typeof raw === 'number') {
      return { rated: raw, unrated: 0, total: raw };
    }
    return raw;
  };
  const anyActive = options.some((o) => (laneCount(o.id)?.total ?? 0) > 0);
  const sectionLabel = isOpen ? 'Open seats by clock' : 'Live boards by clock';
  const hintActive = isOpen ? 'Green' : 'Violet';
  const hintNoun = isOpen ? 'open seat' : 'live board';

  return (
    <div
      className="mt-3"
      data-testid={`mode-room-clock-activity-${variant}-${mode}`}
      aria-label={sectionLabel}
    >
      <p className="text-[10px] leading-snug text-gray-600">
        {hintActive} = {hintNoun} in that clock right now. Tap to filter the list below.
      </p>
      <ul
        className={`mt-2 grid gap-2 ${
          options.length <= 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
        }`}
      >
        {options.map((opt) => {
          const lanes = isOpen ? laneCount(opt.id) : null;
          const count = isOpen ? (lanes?.total ?? 0) : (countsByClock[opt.id] as number) ?? 0;
          const lit = count > 0;
          const selected = selectedClock === opt.id;
          const openTile = isOpen && lanes ? formatModeRoomOpenClockTile(opt.label, lanes) : null;
          const detail = isOpen
            ? (openTile?.compactDetail ?? `${opt.label} · no open seats`)
            : formatModeRoomWatchClockTile(opt.label, count);
          const inactiveDetail = isOpen
            ? `${opt.label} · no open seats`
            : `${opt.label} · no live`;

          const activeClasses = isOpen
            ? 'border-emerald-500/55 bg-[#0f1a14] shadow-[0_0_0_1px_rgba(16,185,129,0.18)] hover:border-emerald-400/70 hover:bg-[#102016]'
            : 'border-violet-500/50 bg-[#140f1c] shadow-[0_0_0_1px_rgba(139,92,246,0.12)] hover:border-violet-400/60 hover:bg-[#1a1424]';
          const selectedRing = isOpen
            ? 'ring-2 ring-emerald-400/45 ring-offset-1 ring-offset-[#0a1018]'
            : 'ring-2 ring-violet-400/45 ring-offset-1 ring-offset-[#0c0e12]';
          const dotLit = isOpen
            ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.65)]'
            : 'bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,0.55)]';
          const textLit = isOpen ? 'text-emerald-300/95' : 'text-violet-200/95';

          return (
            <li key={opt.id} className="min-h-0">
              <button
                type="button"
                onClick={() => onSelectClock(opt.id)}
                aria-pressed={selected}
                aria-label={
                  lit
                    ? `${detail} — show ${isOpen ? 'open games' : 'spectator list'} for ${opt.label}`
                    : `${inactiveDetail} — switch to ${opt.label}`
                }
                className={`flex min-h-[52px] w-full touch-manipulation flex-col justify-between gap-1 rounded-lg border px-2 py-2 text-left transition active:opacity-95 ${focusRing} ${
                  lit ? activeClasses : 'border-[#2a3442] bg-[#111723] hover:border-white/20 hover:bg-[#141c2a]'
                } ${selected ? selectedRing : ''}`}
                data-testid={`mode-room-clock-${variant}-${mode}-${opt.id}`}
                data-active={lit ? 'true' : 'false'}
                data-count={count}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${lit ? dotLit : 'bg-gray-600'}`}
                    aria-hidden
                  />
                  <span className="min-w-0 truncate text-[12px] font-semibold text-gray-100">{opt.label}</span>
                </div>
                {isOpen && openTile && lit ? (
                  <span className={`flex flex-col gap-0.5 text-[10px] font-semibold leading-tight ${textLit}`}>
                    {openTile.sublines.length > 1 ? (
                      openTile.sublines.map((line) => (
                        <span key={line} className="block">
                          {line}
                        </span>
                      ))
                    ) : (
                      <span className="block">{openTile.compactDetail}</span>
                    )}
                  </span>
                ) : (
                  <span className={`text-[10px] font-semibold leading-tight ${lit ? textLit : 'text-gray-500'}`}>
                    {lit ? detail : inactiveDetail}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {loading ? (
        <p className="mt-1.5 text-[10px] text-gray-600" role="status">
          Updating clock activity…
        </p>
      ) : null}
      {!loading && !anyActive ? (
        <p className="mt-1.5 text-[10px] text-gray-600" data-testid={`mode-room-clock-activity-${variant}-empty`}>
          No {isOpen ? 'open seats' : 'live boards'} in any {mode} clock right now.
        </p>
      ) : null}
    </div>
  );
}
