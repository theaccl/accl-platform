'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import {
  CompareTickerPanel,
  comparePeriodLaneWindow,
} from '@/components/profile/ratings/CompareTickerPanel';
import {
  ExpandedMergeCompareChart,
  MERGE_COMPARE_STYLE,
  type ExpandedMergeSeries,
} from '@/components/profile/ratings/ExpandedMergeCompareChart';
import { RatingLaneTabs } from '@/components/profile/ratings/RatingLaneTabs';
import {
  compareAnchorPeriod,
  compareEventLinks,
  ctPeriod,
  isRealGameEvent,
  periodOccupancy,
  pointsInPeriod,
  rankedSeriesOrder,
  removeCompareTicker,
  setCompareLayout,
  setCtAnchor,
  stepCtPeriod,
  type CompareBucketLane,
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
  mainLoad?: CompareTickerPeriodLoad;
  nowMs: number;
  onSessionChange: (session: CompareSessionState) => void;
  mainFamilyControls: ReactNode;
  mainTicker: ReactNode;
  mainColor: string;
};

function mergeGameSelectionLabel(point: RatingHistoryPoint): string {
  const family = point.mode ?? point.ratingTrackId;
  const control = point.timeControl ? ` · ${point.timeControl}` : '';
  const opponent = point.opponentUsername ? ` · vs ${point.opponentUsername}` : '';
  return `${point.occurredAt.slice(0, 16).replace('T', ' ')} UTC · ${family}${control}${opponent} · ${point.result} · ${point.ratingBefore} → ${point.ratingAfter} (${point.ratingDelta >= 0 ? '+' : ''}${point.ratingDelta})`;
}

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
  mainLoad,
  nowMs,
  onSessionChange,
  mainFamilyControls,
  mainTicker,
  mainColor,
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
  const mergeTargetPeriod = useMemo(() => {
    if (lane === 'overall') return null;
    return compareAnchorPeriod(
      lane as CompareBucketLane,
      nowMs,
      RATING_TICKER_DISPLAY_TIME_ZONE,
    );
  }, [lane, nowMs]);
  const mergeTargetWindow = useMemo(
    () => mergeTargetPeriod ? comparePeriodLaneWindow(mergeTargetPeriod) : null,
    [mergeTargetPeriod],
  );
  const mergeSeries = useMemo(() => {
    if (!mergeTargetPeriod || !mergeTargetWindow) return [] as ExpandedMergeSeries[];
    const mainOccupancy = mainLoad
      ? periodOccupancy(mainLoad.points, mergeTargetPeriod, mainLoad.coverage)
      : null;
    const mainCoverage = mainLoad ? mainOccupancy?.coverage ?? 'incomplete' : 'loading';
    const result: ExpandedMergeSeries[] = [{
      id: 'main',
      label: 'Main',
      rank: 1,
      color: mainColor || MERGE_COMPARE_STYLE.main.color,
      points: mainLoad && mainCoverage === 'complete'
        ? pointsInPeriod(mainLoad.points, mergeTargetPeriod)
        : [],
      carryInRating: mainCoverage === 'complete' ? mainOccupancy?.carryInRating ?? null : null,
      sourceWindow: mergeTargetWindow,
      periodCaption: mergeTargetWindow.caption,
      coverage: mainCoverage,
      coverageMessage: mainLoad?.message,
    }];
    for (const ticker of orderedCts) {
      const period = ctPeriod(session, ticker.slot, RATING_TICKER_DISPLAY_TIME_ZONE);
      const loaded = loads[ticker.slot];
      if (!period) continue;
      const occupancy = loaded ? periodOccupancy(loaded.points, period, loaded.coverage) : null;
      const coverage = loaded ? occupancy?.coverage ?? 'incomplete' : 'loading';
      const style = MERGE_COMPARE_STYLE[ticker.slot];
      result.push({
        id: ticker.slot,
        label: ticker.slot.toUpperCase(),
        rank: ticker.rank,
        color: style.color,
        dashArray: style.dashArray,
        points: loaded && coverage === 'complete' ? pointsInPeriod(loaded.points, period) : [],
        carryInRating: coverage === 'complete' ? occupancy?.carryInRating ?? null : null,
        sourceWindow: comparePeriodLaneWindow(period),
        periodCaption: comparePeriodLaneWindow(period).caption,
        coverage,
        coverageMessage: loaded?.message,
      });
    }
    return result;
  }, [loads, mainColor, mainLoad, mergeTargetPeriod, mergeTargetWindow, orderedCts, session]);
  const effectiveLayout = lane === 'overall' || orderedCts.length === 0
    ? 'independent'
    : session.layout;

  function apply(result: CompareOpResult) {
    if (result.ok) onSessionChange(result.state);
  }

  function showPanel(panelId: string) {
    dialogRef.current
      ?.querySelector<HTMLElement>(`#${panelId}`)
      ?.scrollIntoView({ behavior: 'auto', block: 'start' });
  }

  const mobilePanelLinks = [
    { id: 'expanded-independent-panel-main', label: 'Main' },
    ...orderedCts.map((ticker) => ({
      id: `expanded-independent-panel-${ticker.slot}`,
      label: ticker.slot.toUpperCase(),
    })),
  ];

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
      data-compare-layout={effectiveLayout}
      data-panel-count={orderedCts.length + 1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="expanded-independent-title"
      tabIndex={-1}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#2f3f54] px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 id="expanded-independent-title" className="m-0 truncate text-sm font-semibold text-white">
            {trackLabel} comparison
          </h3>
          <p className="m-0 text-xs text-gray-400">
            {effectiveLayout === 'merge'
              ? `${orderedCts.length + 1} calendar-aligned series`
              : `Main and ${orderedCts.length} comparison ${orderedCts.length === 1 ? 'panel' : 'panels'}`}
          </p>
        </div>
        <div
          className="order-3 flex w-full items-center justify-center gap-1 rounded-lg border border-[#2f3f54] bg-[#0b121c] p-1 sm:order-none sm:w-auto"
          role="tablist"
          aria-label="Comparison layout"
        >
          <button
            type="button"
            role="tab"
            aria-selected={effectiveLayout === 'independent'}
            onClick={() => onSessionChange(setCompareLayout(session, 'independent'))}
            className={`rounded-md px-3 py-1 text-xs font-semibold ${
              effectiveLayout === 'independent' ? 'bg-sky-950/40 text-sky-200' : 'text-gray-400'
            }`}
          >
            Independent
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={effectiveLayout === 'merge'}
            aria-label="Merge"
            disabled={lane === 'overall' || orderedCts.length === 0 || !mergeTargetWindow}
            onClick={() => onSessionChange(setCompareLayout(session, 'merge'))}
            className={`rounded-md px-3 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
              effectiveLayout === 'merge' ? 'bg-sky-950/40 text-sky-200' : 'text-gray-400'
            }`}
          >
            Merge
          </button>
        </div>
        <button
          type="button"
          onClick={() => onCloseRef.current()}
          className="order-2 shrink-0 rounded-md border border-[#3d5168] px-3 py-1 text-sm text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 sm:order-none"
          data-testid="expanded-independent-close"
        >
          Close
        </button>
      </header>

      <div
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-3 sm:px-4"
        data-testid="expanded-independent-body-scroll"
      >
        {effectiveLayout === 'independent' ? <nav
          className="sticky top-0 z-10 -mx-3 mb-3 flex items-center gap-2 overflow-x-auto border-b border-[#2f3f54] bg-[#070b10] px-3 py-2 lg:hidden"
          aria-label="Independent comparison panels"
          data-testid="expanded-independent-panel-navigation"
        >
          <span className="shrink-0 text-xs font-semibold text-gray-300">Panels</span>
          {mobilePanelLinks.map((panel) => (
            <button
              key={panel.id}
              type="button"
              aria-controls={panel.id}
              onClick={() => showPanel(panel.id)}
              className="min-h-9 shrink-0 rounded-md border border-[#3d5168] px-3 py-1 text-xs font-semibold text-sky-200"
            >
              {panel.label}
            </button>
          ))}
        </nav> : null}
        {effectiveLayout === 'independent' ? <div className="grid min-w-0 gap-3 lg:grid-cols-2" data-testid="expanded-independent-panel-grid">
          <article
            id="expanded-independent-panel-main"
            className="min-w-0 scroll-mt-16 space-y-3 rounded-xl border border-sky-400/40 bg-[#0f1723] p-3"
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
                panelId={`expanded-independent-panel-${ticker.slot}`}
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
        </div> : mergeTargetWindow ? (
          <div className="space-y-3" data-testid="expanded-merge-layout">
            <article className="min-w-0 space-y-3 rounded-xl border border-sky-400/40 bg-[#0f1723] p-3">
              <header>
                <h4 className="m-0 text-sm font-semibold uppercase tracking-wide text-sky-300">Merged comparison · Main rank 1</h4>
                <p className="m-0 mt-1 text-xs text-gray-400">Main controls the {lane} view. Historical periods align by calendar position.</p>
              </header>
              <RatingLaneTabs
                lane={lane}
                onLaneChange={onLaneChange}
                testIdPrefix="rating"
                ariaLabel="Expanded rating history window"
              />
              <ExpandedMergeCompareChart
                series={mergeSeries}
                targetWindow={mergeTargetWindow}
                canLinkFinishedGames={canLinkFinishedGames}
                nowMs={nowMs}
              />
            </article>
            <section className="grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-3" aria-label="Merged comparison periods" data-testid="expanded-merge-period-controls">
              {orderedCts.map((ticker) => {
                const period = ctPeriod(session, ticker.slot, RATING_TICKER_DISPLAY_TIME_ZONE);
                if (!period) return null;
                const loaded = loads[ticker.slot];
                const occupancy = loaded ? periodOccupancy(loaded.points, period, loaded.coverage) : null;
                const slotName = ticker.slot.toUpperCase();
                return (
                  <article key={ticker.slot} className="min-w-0 rounded-lg border border-[#3d5168] bg-[#0f1723] p-3" data-testid={`expanded-merge-controls-${ticker.slot}`}>
                    <header className="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <h5 className="m-0 text-sm font-semibold" style={{ color: MERGE_COMPARE_STYLE[ticker.slot].color }}>{slotName} · rank {ticker.rank}</h5>
                        <p className="m-0 text-xs text-gray-400">{comparePeriodLaneWindow(period).caption}</p>
                        <p className="m-0 text-xs text-gray-300">
                          {!loaded
                            ? 'Loading verified history…'
                            : occupancy?.coverage === 'complete'
                              ? `${occupancy.games} games · ${occupancy.ratingEvents} rating events`
                              : 'Coverage incomplete'}
                        </p>
                      </div>
                      <button type="button" onClick={() => apply(removeCompareTicker(session, ticker.slot))} aria-label={`Remove ${slotName}`} className="text-xs text-gray-300">Remove</button>
                    </header>
                    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] items-end gap-2">
                      <button
                        type="button"
                        onClick={() => apply(stepCtPeriod(session, ticker.slot, 'prev', nowMs, RATING_TICKER_DISPLAY_TIME_ZONE))}
                        aria-label={`Previous period for ${slotName}`}
                        className="min-h-10 rounded-md border border-[#3d5168] text-sky-200"
                      >←</button>
                      <label className="min-w-0 text-xs text-gray-300">
                        Choose date
                        <input
                          type="date"
                          aria-label={`UTC date for ${slotName}`}
                          value={new Date(ticker.anchorMs).toISOString().slice(0, 10)}
                          max={new Date(nowMs).toISOString().slice(0, 10)}
                          onChange={(event) => {
                            if (event.target.value) {
                              apply(setCtAnchor(session, ticker.slot, Date.parse(`${event.target.value}T00:00:00Z`), nowMs, RATING_TICKER_DISPLAY_TIME_ZONE));
                            }
                          }}
                          className="mt-1 block min-h-10 w-full min-w-0 rounded-md border border-[#3d5168] bg-[#0b121c] px-2 text-gray-100"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={period.endMs > nowMs}
                        onClick={() => apply(stepCtPeriod(session, ticker.slot, 'next', nowMs, RATING_TICKER_DISPLAY_TIME_ZONE))}
                        aria-label={`Next period for ${slotName}`}
                        className="min-h-10 rounded-md border border-[#3d5168] text-sky-200 disabled:opacity-40"
                      >→</button>
                    </div>
                    <details className="mt-2 rounded-md border border-[#2f3f54]">
                      <summary className="cursor-pointer px-2 py-1.5 text-xs font-semibold text-sky-300">Choose from games</summary>
                      <ul className="m-0 max-h-40 list-none space-y-1 overflow-y-auto border-t border-[#2f3f54] p-2">
                        {games.length ? games.map((game) => {
                          const links = compareEventLinks(game);
                          const selectionLabel = mergeGameSelectionLabel(game);
                          return (
                            <li key={game.id} className="text-xs text-gray-300">
                              <button
                                type="button"
                                className="text-left"
                                aria-label={`Use ${selectionLabel} for ${slotName}`}
                                onClick={() => apply(setCtAnchor(session, ticker.slot, Date.parse(game.occurredAt), nowMs, RATING_TICKER_DISPLAY_TIME_ZONE))}
                              >
                                {selectionLabel}
                              </button>
                              {canLinkFinishedGames && links.openGameHref ? (
                                <span className="ml-2 inline-flex gap-2">
                                  <Link href={links.openGameHref}>Open game</Link>
                                  <Link href={links.trainerReviewHref!}>Trainer review</Link>
                                </span>
                              ) : null}
                            </li>
                          );
                        }) : (
                          <li className="text-xs text-gray-500">No loaded finished games.</li>
                        )}
                      </ul>
                    </details>
                  </article>
                );
              })}
            </section>
          </div>
        ) : null}
        {lane === 'overall' ? (
          <p className="mt-3 text-xs text-gray-400" data-testid="expanded-compare-overall-explanation">
            Choose Day, Week, Month, or Year. Comparing another Overall range would be redundant.
          </p>
        ) : null}
      </div>
    </div>
  );
}
