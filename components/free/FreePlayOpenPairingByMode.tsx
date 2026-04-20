'use client';

import { PLAT_MODE_LABELS, PLAT_MODE_ORDER, type PlatMode } from '@/lib/freePlayModeTimeControl';

type Props = {
  activity: Record<PlatMode, boolean>;
  loading: boolean;
};

/**
 * Shows whether public open seats exist in each PLAT mode (bullet/blitz/rapid/daily).
 */
export function FreePlayOpenPairingByMode({ activity, loading }: Props) {
  return (
    <section
      className="mb-4 rounded-xl border border-[#243244] bg-[#0f141c] px-4 py-3 sm:px-5"
      data-testid="free-open-pairing-by-mode"
      aria-label="Open public pairing by mode"
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
        Open public pairing
      </h2>
      <p className="mt-1.5 text-xs leading-snug text-gray-500">
        Someone is waiting for an opponent in <strong className="text-gray-400">Find Match</strong> — one open
        seat per mode below when lit.
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PLAT_MODE_ORDER.map((mode) => {
          const on = activity[mode];
          return (
            <li
              key={mode}
              className="flex min-h-[44px] items-center gap-2 rounded-lg border border-[#2a3442] bg-[#111723] px-2.5 py-2"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${on ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-gray-600'}`}
                aria-hidden
                title={on ? 'Open seat in this mode' : 'No open seat in this mode'}
              />
              <span className="min-w-0 text-[13px] font-medium text-gray-200">{PLAT_MODE_LABELS[mode]}</span>
              <span className="sr-only">{on ? 'has activity' : 'no activity'}</span>
            </li>
          );
        })}
      </ul>
      {loading ? (
        <p className="mt-2 text-[11px] text-gray-600" role="status">
          Checking open seats…
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-gray-600">
          <span className="text-emerald-400/90">●</span> = at least one public open seat in that mode.
        </p>
      )}
    </section>
  );
}
