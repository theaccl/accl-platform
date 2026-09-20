'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { CompareTickerPanel } from '@/components/profile/ratings/CompareTickerPanel';
import { compareGameCategory, type CompareGameCategoryId } from '@/lib/profile/compareGamePicker';
import {
  addCompareTicker,
  ctPeriod,
  isRealGameEvent,
  rankedSeriesOrder,
  removeCompareTicker,
  reopenCompareSessionForUtcDay,
  selectCtGame,
  setCtSourceTrack,
  setCtAnchor,
  stepCtPeriod,
  type ComparePeriod,
  type CompareSeriesId,
  type CompareSessionState,
  type CompareTickerSlot,
} from '@/lib/profile/compareMode';
import type { CompareTickerPeriodLoad } from '@/lib/profile/loadCompareTickerPeriod';
import { RATING_TICKER_DISPLAY_TIME_ZONE } from '@/lib/profile/ratingTickerTimeZone';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';
import type { RatingLane } from '@/lib/ratingHistoryMetrics';

export type ComparePeriodLoader = (
  period: ComparePeriod,
  seriesId: CompareSeriesId,
  sourceTrackId: string,
) => Promise<CompareTickerPeriodLoad>;

type Props = {
  lane: RatingLane;
  isSelf: boolean;
  canLinkFinishedGames: boolean;
  gamePickerPoints: RatingHistoryPoint[];
  mainTrackId: string;
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: CompareSessionState;
  onSessionChange: (session: CompareSessionState) => void;
  loads: Partial<Record<CompareTickerSlot, CompareTickerPeriodLoad>>;
  nowMs: number;
  earliestMs: number | null;
  onNowMsChange: (nowMs: number) => void;
};

export function CompactCompareMode({
  lane,
  isSelf,
  canLinkFinishedGames,
  gamePickerPoints,
  mainTrackId,
  children,
  open,
  onOpenChange,
  session,
  onSessionChange,
  loads,
  nowMs,
  earliestMs,
  onNowMsChange,
}: Props) {
  const [activePanel, setActivePanel] = useState(0);
  const mainPanelRef = useRef<HTMLElement | null>(null);
  const panelRefs = useRef<Partial<Record<CompareTickerSlot, HTMLElement | null>>>({});

  const orderedCts = useMemo(() => {
    const order = rankedSeriesOrder(session).filter((id): id is CompareTickerSlot => id !== 'main');
    return order.map((slot) => session.cts.find((ct) => ct.slot === slot)!).filter(Boolean);
  }, [session]);

  useEffect(() => {
    setActivePanel((previous) => Math.min(previous, orderedCts.length));
  }, [orderedCts.length]);

  if (!isSelf) return <>{children}</>;

  function apply(result: ReturnType<typeof addCompareTicker>) {
    if (result.ok) onSessionChange(result.state);
  }

  function addTicker() {
    const currentMs = Date.now();
    onNowMsChange(currentMs);
    apply(addCompareTicker(session, currentMs, currentMs, RATING_TICKER_DISPLAY_TIME_ZONE));
    onOpenChange(true);
  }

  function openExistingSession() {
    const currentMs = Date.now();
    onNowMsChange(currentMs);
    onSessionChange(reopenCompareSessionForUtcDay(session, currentMs));
    setActivePanel(0);
    onOpenChange(true);
  }

  function updateAnchor(slot: CompareTickerSlot, ms: number) {
    apply(setCtAnchor(session, slot, ms, nowMs, RATING_TICKER_DISPLAY_TIME_ZONE, earliestMs));
  }

  function chooseGame(slot: CompareTickerSlot, game: RatingHistoryPoint) {
    const category = compareGameCategory(game);
    if (!category) return;
    apply(selectCtGame(session, slot, game, category, nowMs, RATING_TICKER_DISPLAY_TIME_ZONE, earliestMs));
  }

  function chooseCategory(slot: CompareTickerSlot, category: CompareGameCategoryId) {
    apply(setCtSourceTrack(session, slot, category));
  }

  function showPanel(index: number) {
    const clamped = Math.max(0, Math.min(index, orderedCts.length));
    setActivePanel(clamped);
    if (clamped === 0) {
      mainPanelRef.current?.scrollIntoView({ behavior: 'auto', inline: 'start', block: 'nearest' });
      return;
    }
    const slot = orderedCts[clamped - 1]?.slot;
    if (slot) panelRefs.current[slot]?.scrollIntoView({ behavior: 'auto', inline: 'start', block: 'nearest' });
  }

  const games = gamePickerPoints
    .filter((point) => {
      const occurredMs = Date.parse(point.occurredAt);
      return isRealGameEvent(point)
        && occurredMs <= nowMs
        && (earliestMs === null || occurredMs >= earliestMs);
    })
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  return (
    <section className="space-y-3 border-t border-[#2f3f54] pt-3" data-testid="compact-compare-mode">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="m-0 text-sm font-semibold text-white">Compare Mode</h4>
          <p className="m-0 text-xs text-gray-400">Main stays fixed; comparison tickers use Main&apos;s {lane} scale.</p>
        </div>
        {lane === 'overall' ? (
          <button type="button" disabled className="rounded-md border border-[#2f3f54] px-3 py-2 text-xs text-gray-500">
            Unavailable on Overall
          </button>
        ) : (
          <button
            type="button"
            onClick={open ? () => onOpenChange(false) : orderedCts.length ? openExistingSession : addTicker}
            className="rounded-md border border-sky-400/60 px-3 py-2 text-xs font-semibold text-sky-200"
            data-testid="compare-mode-toggle"
          >
            {open ? 'Close Compare' : orderedCts.length ? 'Open Compare' : 'Compare Mode'}
          </button>
        )}
      </div>
      {lane === 'overall' ? (
        <p className="m-0 text-xs text-gray-500" data-testid="compare-mode-overall-explanation">
          Choose Day, Week, Month, or Year. Comparing another Overall range would be redundant.
        </p>
      ) : null}

      {open && lane !== 'overall' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={orderedCts.length >= 3}
              onClick={addTicker}
              data-testid="compare-add-ticker"
              className="rounded-md border border-[#3d5168] px-3 py-2 text-xs text-gray-200 disabled:opacity-40"
            >
              Add comparison ({orderedCts.length}/3)
            </button>
            {orderedCts.length > 0 ? (
              <div className="ml-auto flex gap-2" aria-label="Comparison panel navigation">
                <button type="button" onClick={() => showPanel(activePanel - 1)} disabled={activePanel === 0}>Previous panel</button>
                <button type="button" onClick={() => showPanel(activePanel + 1)} disabled={activePanel >= orderedCts.length}>Next panel</button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
      <div
        className={`flex gap-3 pb-2 ${open && lane !== 'overall' ? 'snap-x snap-mandatory overflow-x-auto' : 'overflow-hidden'}`}
        data-testid="compare-panel-strip"
      >
        <article
          ref={mainPanelRef}
          className={`${open && lane !== 'overall' ? 'w-[min(100%,38rem)] min-w-[min(100%,22rem)] shrink-0 snap-start' : 'w-full'} space-y-2`}
          data-testid="compare-panel-main"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-sky-300">Main · rank 1 · fixed</span>
          </div>
          {children}
        </article>
        {open && lane !== 'overall' ? (
          <>
            {orderedCts.map((ct) => {
              const period = ctPeriod(session, ct.slot, RATING_TICKER_DISPLAY_TIME_ZONE)!;
              return (
                <CompareTickerPanel
                  key={ct.slot}
                  ticker={ct}
                  period={period}
                  loaded={loads[ct.slot]}
                  games={games}
                  mainTrackId={mainTrackId}
                  canLinkFinishedGames={canLinkFinishedGames}
                  nowMs={nowMs}
                  earliestMs={earliestMs}
                  variant="compact"
                  panelRef={(node) => { panelRefs.current[ct.slot] = node; }}
                  onRemove={() => apply(removeCompareTicker(session, ct.slot))}
                  onStep={(direction) => apply(stepCtPeriod(
                    session,
                    ct.slot,
                    direction,
                    nowMs,
                    RATING_TICKER_DISPLAY_TIME_ZONE,
                    earliestMs,
                  ))}
                  onSetAnchor={(anchorMs) => updateAnchor(ct.slot, anchorMs)}
                  onSelectGame={(game) => chooseGame(ct.slot, game)}
                  onSelectCategory={(category) => chooseCategory(ct.slot, category)}
                />
              );
            })}
          </>
        ) : null}
      </div>
    </section>
  );
}
