'use client';

import { PLAT_MODE_LABELS, PLAT_MODE_ORDER, type PlatMode } from '@/lib/freePlayModeTimeControl';
import { forceDomNavigation } from '@/lib/forceDomNavigation';

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f141c]';

type Props = {
  activity: Record<PlatMode, boolean>;
  loading: boolean;
  /** When set (hub), show a second link to that mode’s “Watch live” list when lit. */
  watchActivity?: Record<PlatMode, boolean>;
};

/**
 * Hub shortcuts: native anchors + forced assign on primary click (Lit = hash to Open Games).
 */
export function FreePlayOpenPairingByMode({ activity, loading, watchActivity }: Props) {
  return (
    <section
      className="relative z-[100] mb-4 rounded-xl border border-[#243244] bg-[#0f141c] px-4 py-3 sm:px-5"
      data-testid="free-open-pairing-by-mode"
      aria-label="Quick shortcuts to mode rooms when open seats are waiting"
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
        Open public pairing
      </h2>
      <p className="mt-1.5 text-xs leading-snug text-gray-500">
        <strong className="text-emerald-400/90">Lit</strong> = someone is waiting in that mode —{' '}
        <strong className="text-gray-300">tap a tile</strong> to jump to <strong className="text-gray-400">Open Games</strong>{' '}
        there now. <strong className="text-gray-500">Not lit</strong> = open the mode room (chat, queue).{' '}
        <strong className="text-gray-400">Mode rooms</strong> below always work too.
      </p>
      <ul className="relative z-[101] mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PLAT_MODE_ORDER.map((mode) => {
          const on = activity[mode];
          const watchOn = watchActivity?.[mode] === true;
          const modeLabel = PLAT_MODE_LABELS[mode];
          const modeRoomHref = on
            ? `/free/lobby/${mode}#free-lobby-open-games-anchor`
            : `/free/lobby/${mode}`;
          const shortcutLabel = on
            ? `${modeLabel}: open seat waiting — go to Open Games now`
            : `${modeLabel} mode room — open`;
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
                className={`flex min-h-[48px] w-full touch-manipulation flex-col rounded-lg border px-2.5 py-2 text-left font-sans text-inherit no-underline shadow-sm transition active:opacity-95 [-webkit-tap-highlight-color:rgba(16,185,129,0.25)] ${focusRing} ${
                  on
                    ? 'border-emerald-500/55 bg-[#0f1a14] shadow-[0_0_0_1px_rgba(16,185,129,0.18)] hover:border-emerald-400/70 hover:bg-[#102016] hover:shadow-[0_0_12px_rgba(16,185,129,0.12)]'
                    : 'border-[#2a3442] bg-[#111723] hover:border-sky-500/35 hover:bg-[#141c2a]'
                }`}
                title={
                  on
                    ? `${modeLabel}: tap to open Open Games (someone is waiting)`
                    : `${modeLabel} room — open mode room`
                }
                data-testid={`free-open-pairing-link-${mode}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${on ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.65)]' : 'bg-gray-600'}`}
                    aria-hidden
                  />
                  <span className="min-w-0 text-[13px] font-semibold text-gray-100">{modeLabel}</span>
                </span>
                {on ? (
                  <span className="mt-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300/95">
                    Open games →
                  </span>
                ) : (
                  <span className="mt-1 text-[10px] font-medium text-gray-500">Enter room</span>
                )}
              </a>
              {watchActivity ? (
                watchOn ? (
                  <a
                    href={`/free/lobby/${mode}#watch-as-spectator-anchor`}
                    onClick={(e) =>
                      forceDomNavigation(e, `/free/lobby/${mode}#watch-as-spectator-anchor`)
                    }
                    onPointerUp={(e) => {
                      if (e.pointerType === 'touch') {
                        window.location.assign(`/free/lobby/${mode}#watch-as-spectator-anchor`);
                      }
                    }}
                    className={`mt-1 block touch-manipulation rounded-md py-1 text-center text-[10px] font-semibold leading-tight text-violet-300 underline-offset-2 hover:text-violet-100 hover:underline ${focusRing}`}
                    data-testid={`free-open-pairing-watch-${mode}`}
                  >
                    Watch live →
                  </a>
                ) : (
                  <span
                    className="mt-1 block py-0.5 text-center text-[10px] font-medium leading-tight text-gray-600"
                    data-testid={`free-open-pairing-watch-${mode}`}
                  >
                    No live games
                  </span>
                )
              ) : null}
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
          <span className="font-medium text-emerald-400/90">Lit tile</span> = waiting game —{' '}
          <span className="text-gray-400">tap it</span> to go straight to Open Games in that mode.
        </p>
      )}
    </section>
  );
}
