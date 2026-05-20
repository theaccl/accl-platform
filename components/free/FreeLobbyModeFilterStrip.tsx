'use client';

import Link from 'next/link';

import { PLAT_MODE_LABELS, PLAT_MODE_ORDER, type PlatMode } from '@/lib/freePlayModeTimeControl';
import type { LobbyHubModeFilter } from '@/lib/lobbyModeFilter';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0c0e12]';

export type ModeStripSignals = {
  liveByMode: Record<PlatMode, number>;
  openByMode: Record<PlatMode, number>;
  tournamentByMode: Record<PlatMode, number>;
  yourMoveByMode: Record<PlatMode, number>;
};

type Props = {
  selected: LobbyHubModeFilter;
  onSelect: (mode: LobbyHubModeFilter) => void;
  signals: ModeStripSignals;
  loading?: boolean;
};

function signalLine(signals: ModeStripSignals, mode: PlatMode): string {
  const live = signals.liveByMode[mode] ?? 0;
  const open = signals.openByMode[mode] ?? 0;
  const t = signals.tournamentByMode[mode] ?? 0;
  const parts: string[] = [];
  parts.push(`${live} live`);
  parts.push(`${open} open`);
  if (t > 0) parts.push(`${t} tournament`);
  return parts.join(' · ');
}

/**
 * Compact operational mode filters — primary click filters hub feeds (not navigation).
 */
export function FreeLobbyModeFilterStrip({ selected, onSelect, signals, loading }: Props) {
  return (
    <section
      className="mb-4 rounded-xl border border-[#2a3a4f] bg-[#0d1219] px-3 py-3 sm:px-4"
      data-testid="free-lobby-mode-filter-strip"
      aria-label="Mode filters"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">Mode filter</h2>
        <p className="text-[10px] text-gray-600">Tap to filter · room link for depth</p>
      </div>
      <div
        className="mt-2 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Filter lobby by mode"
      >
        <ModeChip
          label="All"
          selected={selected === null}
          onClick={() => onSelect(null)}
          testId="free-lobby-mode-filter-all"
          pulse={Object.values(signals.yourMoveByMode).some((n) => n > 0)}
          signal={loading ? '…' : 'All modes'}
        />
        {PLAT_MODE_ORDER.map((mode) => (
          <ModeChip
            key={mode}
            label={PLAT_MODE_LABELS[mode]}
            selected={selected === mode}
            onClick={() => onSelect(selected === mode ? null : mode)}
            testId={`free-lobby-mode-filter-${mode}`}
            pulse={(signals.yourMoveByMode[mode] ?? 0) > 0}
            signal={loading ? '…' : signalLine(signals, mode)}
            roomHref={`/free/lobby/${mode}`}
          />
        ))}
      </div>
    </section>
  );
}

function ModeChip({
  label,
  selected,
  onClick,
  testId,
  pulse,
  signal,
  roomHref,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  testId: string;
  pulse: boolean;
  signal: string;
  roomHref?: string;
}) {
  return (
    <div
      className={`flex min-w-[108px] shrink-0 flex-col rounded-lg border px-2.5 py-2 transition ${
        selected
          ? 'border-sky-500/55 bg-sky-950/35 shadow-[0_0_0_1px_rgba(56,189,248,0.2)]'
          : 'border-[#2a3442] bg-[#111723] hover:border-sky-500/30'
      }`}
    >
      <button
        type="button"
        role="tab"
        aria-selected={selected}
        onClick={onClick}
        data-testid={testId}
        className={`w-full text-left ${focusRing}`}
      >
        <span className="flex items-center gap-1.5">
          {pulse ? (
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]"
              aria-hidden
              data-testid={`${testId}-your-move-pulse`}
            />
          ) : (
            <span className="h-2 w-2 shrink-0 rounded-full bg-gray-600" aria-hidden />
          )}
          <span className="text-[13px] font-semibold text-gray-100">{label}</span>
        </span>
        <span className="mt-1 block text-[10px] leading-snug text-gray-500">{signal}</span>
      </button>
      {roomHref ? (
        <Link
          href={roomHref}
          className="mt-1.5 text-[10px] font-medium text-gray-600 underline-offset-2 hover:text-sky-300 hover:underline"
          data-testid={`${testId}-room-link`}
          onClick={(e) => e.stopPropagation()}
        >
          Room →
        </Link>
      ) : null}
    </div>
  );
}
