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

const MODE_ZONE_STYLE: Record<
  PlatMode,
  { idle: string; active: string; dot: string }
> = {
  bullet: {
    idle: 'border-amber-900/45 bg-gradient-to-b from-amber-950/35 to-[#14100c] hover:border-amber-500/40',
    active:
      'border-amber-400/70 bg-gradient-to-b from-amber-900/50 to-amber-950/40 shadow-[0_0_20px_rgba(251,191,36,0.15)] ring-2 ring-amber-400/35',
    dot: 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.55)]',
  },
  blitz: {
    idle: 'border-red-900/50 bg-gradient-to-b from-red-950/40 to-red-950/70 hover:border-red-500/45',
    active:
      'border-red-400/65 bg-gradient-to-b from-red-900/55 to-red-950/80 shadow-[0_0_20px_rgba(239,68,68,0.18)] ring-2 ring-red-400/35',
    dot: 'bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.55)]',
  },
  rapid: {
    idle: 'border-sky-900/45 bg-gradient-to-b from-sky-950/35 to-[#0c141c] hover:border-sky-500/40',
    active:
      'border-sky-400/65 bg-gradient-to-b from-sky-900/45 to-sky-950/55 shadow-[0_0_20px_rgba(56,189,248,0.15)] ring-2 ring-sky-400/35',
    dot: 'bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.55)]',
  },
  daily: {
    idle: 'border-violet-900/45 bg-gradient-to-b from-violet-950/35 to-[#100f18] hover:border-violet-500/40',
    active:
      'border-violet-400/65 bg-gradient-to-b from-violet-900/45 to-violet-950/55 shadow-[0_0_20px_rgba(167,139,250,0.15)] ring-2 ring-violet-400/35',
    dot: 'bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,0.55)]',
  },
};

function sumModes(signals: ModeStripSignals, key: keyof ModeStripSignals): number {
  return PLAT_MODE_ORDER.reduce((n, m) => n + (signals[key][m] ?? 0), 0);
}

function hasAnyYourMove(signals: ModeStripSignals): boolean {
  return PLAT_MODE_ORDER.some((m) => (signals.yourMoveByMode[m] ?? 0) > 0);
}

/**
 * Operational mode zone cards — filter the hub on primary click; room link is secondary depth.
 */
export function FreeLobbyModeFilterStrip({ selected, onSelect, signals, loading }: Props) {
  const allLive = sumModes(signals, 'liveByMode');
  const allOpen = sumModes(signals, 'openByMode');
  const allTournament = sumModes(signals, 'tournamentByMode');

  return (
    <section
      className="mb-5 rounded-2xl border border-[#2a3a4f] bg-[#0d1219] px-4 py-4 sm:px-5 sm:py-5"
      data-testid="free-lobby-mode-filter-strip"
      aria-label="Mode filters"
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-gray-300">Mode zones</h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            Tap a zone to filter live boards, open seats, and your queues on this page.
          </p>
        </div>
        {selected ? (
          <span className="rounded-md border border-sky-500/40 bg-sky-950/40 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-200">
            Filtering: {PLAT_MODE_LABELS[selected]}
          </span>
        ) : null}
      </div>

      <div
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
        role="tablist"
        aria-label="Filter lobby by mode"
      >
        <ModeFilterCard
          label="All modes"
          selected={selected === null}
          onClick={() => onSelect(null)}
          testId="free-lobby-mode-filter-all"
          zoneStyle={{
            idle: 'border-[#3a4a5f] bg-gradient-to-b from-[#151d2c] to-[#0f141c] hover:border-sky-500/35',
            active:
              'border-sky-400/60 bg-gradient-to-b from-sky-950/45 to-[#0f1a24] shadow-[0_0_24px_rgba(56,189,248,0.12)] ring-2 ring-sky-400/40',
            dot: 'bg-sky-400',
          }}
          loading={loading}
          metrics={{
            live: allLive,
            open: allOpen,
            tournament: allTournament,
            yourMove: hasAnyYourMove(signals),
          }}
        />
        {PLAT_MODE_ORDER.map((mode) => (
          <ModeFilterCard
            key={mode}
            label={PLAT_MODE_LABELS[mode]}
            selected={selected === mode}
            onClick={() => onSelect(selected === mode ? null : mode)}
            testId={`free-lobby-mode-filter-${mode}`}
            zoneStyle={MODE_ZONE_STYLE[mode]}
            loading={loading}
            metrics={{
              live: signals.liveByMode[mode] ?? 0,
              open: signals.openByMode[mode] ?? 0,
              tournament: signals.tournamentByMode[mode] ?? 0,
              yourMove: (signals.yourMoveByMode[mode] ?? 0) > 0,
            }}
            roomHref={`/free/lobby/${mode}`}
          />
        ))}
      </div>
    </section>
  );
}

type ZoneStyle = { idle: string; active: string; dot: string };

function ModeFilterCard({
  label,
  selected,
  onClick,
  testId,
  zoneStyle,
  loading,
  metrics,
  roomHref,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  testId: string;
  zoneStyle: ZoneStyle;
  loading?: boolean;
  metrics: { live: number; open: number; tournament: number; yourMove: boolean };
  roomHref?: string;
}) {
  const surface = selected ? zoneStyle.active : zoneStyle.idle;

  return (
    <div
      className={`flex min-h-[112px] flex-col rounded-xl border px-3 py-3 transition ${surface}`}
      data-testid={testId}
      data-mode-filter-selected={selected ? 'true' : 'false'}
    >
      <button
        type="button"
        role="tab"
        aria-selected={selected}
        onClick={onClick}
        className={`flex flex-1 flex-col text-left ${focusRing}`}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-base font-bold tracking-tight text-white sm:text-lg">{label}</span>
          <span
            className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
              metrics.live > 0 || metrics.open > 0 ? zoneStyle.dot : 'bg-gray-600'
            }`}
            aria-hidden
          />
        </div>

        <dl className="mt-3 grid gap-1.5 text-[11px] leading-tight">
          <MetricRow label="Live" value={loading ? '—' : String(metrics.live)} accent="text-violet-200/90" />
          <MetricRow label="Open" value={loading ? '—' : String(metrics.open)} accent="text-emerald-300/90" />
          {metrics.tournament > 0 || loading ? (
            <MetricRow
              label="Tournament"
              value={loading ? '—' : String(metrics.tournament)}
              accent="text-amber-200/90"
            />
          ) : null}
        </dl>

        {metrics.yourMove ? (
          <span
            className="mt-2 inline-flex w-fit items-center rounded-full border border-emerald-500/45 bg-emerald-950/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300"
            data-testid={`${testId}-your-move-pulse`}
          >
            Your move
          </span>
        ) : null}
      </button>

      {roomHref ? (
        <Link
          href={roomHref}
          className="mt-2 text-[10px] font-semibold text-gray-500 underline-offset-2 hover:text-sky-300 hover:underline"
          data-testid={`${testId}-room-link`}
          onClick={(e) => e.stopPropagation()}
        >
          Room →
        </Link>
      ) : null}
    </div>
  );
}

function MetricRow({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-gray-500">{label}</dt>
      <dd className={`tabular-nums font-semibold ${accent}`}>{value}</dd>
    </div>
  );
}
