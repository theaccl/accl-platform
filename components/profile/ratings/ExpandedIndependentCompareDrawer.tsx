'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { CompareTickerPanel } from '@/components/profile/ratings/CompareTickerPanel';
import { RatingLaneTabs } from '@/components/profile/ratings/RatingLaneTabs';
import {
  ctPeriod,
  isRealGameEvent,
  rankedSeriesOrder,
  removeCompareTicker,
  setCtAnchor,
  stepCtPeriod,
  type CompareOpResult,
  type CompareSessionState,
  type CompareTickerSlot,
} from '@/lib/profile/compareMode';
import type { CompareTickerPeriodLoad } from '@/lib/profile/loadCompareTickerPeriod';
import { attachLandscapeTickerDialogChrome } from '@/lib/profile/landscapeTickerDialogChrome';
import {
  readVisualViewportBox,
  subscribeVisualViewport,
  visualViewportBoxesEqual,
} from '@/lib/profile/landscapeTickerViewport';
import { RATING_TICKER_DISPLAY_TIME_ZONE } from '@/lib/profile/ratingTickerTimeZone';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';
import type { RatingLane } from '@/lib/ratingHistoryMetrics';

type Props = {
  open: boolean;
  onClose: () => void;
  trackLabel: string;
  lane: RatingLane;
  onLaneChange: (lane: RatingLane) => void;
  canLinkFinishedGames: boolean;
  gamePickerPoints: RatingHistoryPoint[];
  session: CompareSessionState;
  loads: Partial<Record<CompareTickerSlot, CompareTickerPeriodLoad>>;
  nowMs: number;
  onSessionChange: (session: CompareSessionState) => void;
  mainFamilyControls: ReactNode;
  mainTicker: ReactNode;
};

export function ExpandedIndependentCompareDrawer(props: Props) {
  if (!props.open || typeof document === 'undefined') return null;
  return createPortal(<ExpandedIndependentOverlay {...props} />, document.body);
}

function ExpandedIndependentOverlay({
  onClose,
  trackLabel,
  lane,
  onLaneChange,
  canLinkFinishedGames,
  gamePickerPoints,
  session,
  loads,
  nowMs,
  onSessionChange,
  mainFamilyControls,
  mainTicker,
}: Props) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [viewportBox, setViewportBox] = useState(readVisualViewportBox);

  useEffect(() => subscribeVisualViewport((box) => {
    setViewportBox((previous) => (visualViewportBoxesEqual(previous, box) ? previous : box));
  }), []);

  useEffect(() => {
    const root = dialogRef.current;
    if (!root) return;
    return attachLandscapeTickerDialogChrome(root, { onClose: () => onCloseRef.current() });
  }, []);

  const orderedCts = useMemo(() => {
    const order = rankedSeriesOrder(session).filter((id): id is CompareTickerSlot => id !== 'main');
    return order.map((slot) => session.cts.find((ticker) => ticker.slot === slot)!).filter(Boolean);
  }, [session]);
  const games = useMemo(
    () => gamePickerPoints
      .filter((point) => isRealGameEvent(point) && Date.parse(point.occurredAt) <= nowMs)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)),
    [gamePickerPoints, nowMs],
  );

  function apply(result: CompareOpResult) {
    if (result.ok) onSessionChange(result.state);
  }

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[400] flex max-h-[100dvh] max-w-[100dvw] flex-col overflow-hidden bg-[#070b10]/95 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]"
      style={{
        top: viewportBox.offsetTop,
        left: viewportBox.offsetLeft,
        width: viewportBox.width,
        height: viewportBox.height,
        right: 'auto',
        bottom: 'auto',
      }}
      data-testid="expanded-independent-compare-drawer"
      data-compare-layout="independent"
      data-panel-count={orderedCts.length + 1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="expanded-independent-title"
      tabIndex={-1}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#2f3f54] px-4 py-3">
        <div className="min-w-0">
          <h3 id="expanded-independent-title" className="m-0 truncate text-sm font-semibold text-white">
            {trackLabel} comparison
          </h3>
          <p className="m-0 text-xs text-gray-400">Main and {orderedCts.length} comparison {orderedCts.length === 1 ? 'panel' : 'panels'}</p>
        </div>
        <div
          className="flex items-center gap-1 rounded-lg border border-[#2f3f54] bg-[#0b121c] p-1"
          role="tablist"
          aria-label="Comparison layout"
        >
          <button
            type="button"
            role="tab"
            aria-selected="true"
            className="rounded-md bg-sky-950/40 px-3 py-1 text-xs font-semibold text-sky-200"
          >
            Independent
          </button>
          <button
            type="button"
            role="tab"
            aria-selected="false"
            aria-label="Merge (coming soon)"
            disabled
            className="rounded-md px-3 py-1 text-xs text-gray-500 disabled:opacity-60"
          >
            Merge
          </button>
        </div>
        <button
          type="button"
          onClick={() => onCloseRef.current()}
          className="shrink-0 rounded-md border border-[#3d5168] px-3 py-1 text-sm text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          data-testid="expanded-independent-close"
        >
          Close
        </button>
      </header>

      <div
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-3 sm:px-4"
        data-testid="expanded-independent-body-scroll"
      >
        <div className="grid min-w-0 gap-3 lg:grid-cols-2" data-testid="expanded-independent-panel-grid">
          <article
            className="min-w-0 space-y-3 rounded-xl border border-sky-400/40 bg-[#0f1723] p-3"
            data-testid="expanded-compare-panel-main"
          >
            <header>
              <h4 className="m-0 text-sm font-semibold uppercase tracking-wide text-sky-300">Main · rank 1 · fixed</h4>
            </header>
            {mainFamilyControls}
            <RatingLaneTabs
              lane={lane}
              onLaneChange={onLaneChange}
              testIdPrefix="rating"
              ariaLabel="Expanded rating history window"
            />
            {mainTicker}
          </article>

          {orderedCts.map((ticker) => {
            const period = ctPeriod(session, ticker.slot, RATING_TICKER_DISPLAY_TIME_ZONE);
            if (!period) return null;
            return (
              <CompareTickerPanel
                key={ticker.slot}
                ticker={ticker}
                period={period}
                loaded={loads[ticker.slot]}
                games={games}
                canLinkFinishedGames={canLinkFinishedGames}
                nowMs={nowMs}
                variant="expanded"
                onRemove={() => apply(removeCompareTicker(session, ticker.slot))}
                onStep={(direction) => apply(stepCtPeriod(
                  session,
                  ticker.slot,
                  direction,
                  nowMs,
                  RATING_TICKER_DISPLAY_TIME_ZONE,
                ))}
                onSetAnchor={(anchorMs) => apply(setCtAnchor(
                  session,
                  ticker.slot,
                  anchorMs,
                  nowMs,
                  RATING_TICKER_DISPLAY_TIME_ZONE,
                ))}
              />
            );
          })}
        </div>
        {lane === 'overall' ? (
          <p className="mt-3 text-xs text-gray-400" data-testid="expanded-compare-overall-explanation">
            Choose Day, Week, Month, or Year. Comparing another Overall range would be redundant.
          </p>
        ) : null}
      </div>
    </div>
  );
}
