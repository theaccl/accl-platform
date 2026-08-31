'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LandscapeTickerFamilyPager } from '@/components/profile/ratings/LandscapeTickerFamilyPager';
import { LandscapeRatingTickerChart } from '@/components/profile/ratings/LandscapeRatingTickerChart';
import { RatingLaneTabs } from '@/components/profile/ratings/RatingLaneTabs';
import { RATING_LANE_EMPTY } from '@/components/profile/ratings/ratingTickerEmptyStates';
import {
  attachLandscapeTickerDialogChrome,
  syncNativeInert,
} from '@/lib/profile/landscapeTickerDialogChrome';
import {
  LANDSCAPE_TICKER_CATEGORIES,
  type LandscapeTickerCategoryId,
} from '@/lib/profile/landscapeTickerCategories';
import {
  LANDSCAPE_TICKER_DEFAULT_FAMILY,
  LANDSCAPE_TICKER_FAMILIES,
  landscapeTickerFamilyById,
  landscapeTickerFamilyIndex,
  type LandscapeTickerFamilyId,
} from '@/lib/profile/landscapeTickerFamilies';
import {
  categoryRevealPhase,
  createLandscapeTickerSession,
  dominanceRank,
  isCategoryQueued,
  isCategorySelected,
  reduceLandscapeTickerSession,
  visibleCategoryIds,
  visibleDominanceOrder,
} from '@/lib/profile/landscapeTickerSession';
import {
  paintedDominanceIds,
  seriesIsDrawable,
} from '@/lib/profile/landscapeTickerHierarchy';
import {
  isLandscapeFitBox,
  isMaterialViewportChange,
  readViewportSize,
  readVisualViewportBox,
  subscribeVisualViewport,
  visualViewportBoxesEqual,
} from '@/lib/profile/landscapeTickerViewport';
import styles from '@/components/profile/ratings/landscapeRatingTicker.module.css';
import { finishedGameHref, finishedGameTrainHref } from '@/lib/profileRatingFinishedLinks';
import { filterPointsByLane, lastRatingAfterBefore, type RatingLane } from '@/lib/ratingHistoryMetrics';
import { ratingLaneWindow } from '@/lib/profile/ratingTickerCalendar';
import { formatOccurredAtInZone, resolveTimeZone } from '@/lib/profile/ratingTickerTimeZone';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';

const RATING_ARROW = '\u2192';
const META_DOT = '\u00B7';

type Props = {
  open: boolean;
  onClose: () => void;
  trackLabel: string;
  currentRating: number | null;
  /** Full authoritative ledger points for the compact-track context (unfiltered). */
  points: RatingHistoryPoint[];
  lane: RatingLane;
  onLaneChange: (lane: RatingLane) => void;
  canLinkFinishedGames: boolean;
  /** Family histories for landscape category lines. Compact ticker is unchanged. */
  historyByTrack?: Record<string, RatingHistoryPoint[]>;
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  return reduced;
}

/**
 * Mount only while open so close/reopen is a clean session (Free, empty, no flash).
 */
export function ExpandedRatingTickerDrawer(props: Props) {
  if (!props.open || typeof document === 'undefined') return null;
  return createPortal(<LandscapeTickerOverlay {...props} />, document.body);
}

function LandscapeTickerOverlay({
  onClose,
  trackLabel,
  currentRating,
  points,
  lane,
  onLaneChange,
  canLinkFinishedGames,
  historyByTrack = {},
}: Props) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const reducedMotion = usePrefersReducedMotion();
  const [session, setSession] = useState(() => createLandscapeTickerSession());
  const [family, setFamily] = useState<LandscapeTickerFamilyId>(LANDSCAPE_TICKER_DEFAULT_FAMILY);
  const [viewportBox, setViewportBox] = useState(readVisualViewportBox);

  useEffect(() => {
    let last = readViewportSize(window);
    let armed = false;
    const arm = window.requestAnimationFrame(() => {
      last = readViewportSize(window);
      armed = true;
    });
    const unsubscribe = subscribeVisualViewport((box) => {
      setViewportBox((prev) => (visualViewportBoxesEqual(prev, box) ? prev : box));
      const next = { width: box.width, height: box.height };
      if (!armed) {
        last = next;
        return;
      }
      if (!isMaterialViewportChange(last, next)) return;
      last = next;
      setSession((prev) => {
        if (!prev.activeReveal && prev.pendingActivations.length === 0) return prev;
        return reduceLandscapeTickerSession(prev, { type: 'settleForViewportChange' });
      });
    });
    return () => {
      window.cancelAnimationFrame(arm);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const root = dialogRef.current;
    if (!root) return;
    return attachLandscapeTickerDialogChrome(root, {
      onClose: () => onCloseRef.current(),
    });
  }, []);

  const timeZone = useMemo(() => resolveTimeZone(), []);
  const nowMs = Date.now();
  const laneWindow = useMemo(() => {
    const times: number[] = [];
    for (const cat of LANDSCAPE_TICKER_CATEGORIES) {
      for (const p of historyByTrack[cat.trackId] ?? []) {
        const t = Date.parse(p.occurredAt);
        if (Number.isFinite(t)) times.push(t);
      }
    }
    const firstEventMs = times.length ? Math.min(...times) : null;
    const lastEventMs = times.length ? Math.max(...times) : null;
    return ratingLaneWindow(lane, nowMs, timeZone, { firstEventMs, lastEventMs });
  }, [historyByTrack, lane, nowMs, timeZone]);

  const categoryLanePoints = useMemo(
    () =>
      LANDSCAPE_TICKER_CATEGORIES.map((cat) => {
        const full = historyByTrack[cat.trackId] ?? [];
        return {
          ...cat,
          points: filterPointsByLane(full, lane, nowMs, timeZone),
          carryInRating:
            lane === 'overall' || !laneWindow
              ? null
              : lastRatingAfterBefore(full, laneWindow.startMs),
        };
      }),
    [historyByTrack, lane, laneWindow, nowMs, timeZone],
  );

  const visibleIds = visibleCategoryIds(session);
  const lanePoints = useMemo(() => {
    const selected = new Set(visibleIds);
    return categoryLanePoints
      .filter((cat) => selected.has(cat.id))
      .flatMap((cat) => cat.points)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }, [categoryLanePoints, visibleIds]);

  const dominanceBackToFront = visibleDominanceOrder(session);
  const drawableById = Object.fromEntries(
    categoryLanePoints.map((cat) => [
      cat.id,
      seriesIsDrawable({
        pointCount: cat.points.length,
        carryInRating: cat.carryInRating,
      }),
    ]),
  );
  const paintedIds = paintedDominanceIds(dominanceBackToFront, drawableById);
  const paintedDominantCategory = paintedIds[paintedIds.length - 1] ?? null;
  const dominantCategory = paintedDominantCategory;
  const chartSeries = useMemo(() => {
    const rows = categoryLanePoints.map((cat) => ({
      id: cat.id,
      label: cat.label,
      color: cat.color,
      points: cat.points,
      carryInRating: cat.carryInRating,
      phase: categoryRevealPhase(session, cat.id),
      revealSerial:
        session.activeReveal?.categoryId === cat.id ? session.activeReveal.serial : null,
      dominanceRank: dominanceRank(session, cat.id),
    }));
    return rows.sort((a, b) => {
      const aRank = a.dominanceRank < 0 ? -1 : a.dominanceRank;
      const bRank = b.dominanceRank < 0 ? -1 : b.dominanceRank;
      if (aRank !== bRank) return aRank - bRank;
      return 0;
    });
  }, [categoryLanePoints, session]);

  const selectedLabels = LANDSCAPE_TICKER_CATEGORIES.filter((cat) =>
    isCategorySelected(session, cat.id),
  ).map((cat) => cat.label);

  const onRevealComplete = useCallback(
    (categoryId: LandscapeTickerCategoryId, serial: number) => {
      setSession((prev) =>
        reduceLandscapeTickerSession(prev, {
          type: 'revealComplete',
          categoryId,
          serial,
          reducedMotion,
        }),
      );
    },
    [reducedMotion],
  );

  const handleLaneChange = useCallback(
    (nextLane: RatingLane) => {
      setSession((prev) => reduceLandscapeTickerSession(prev, { type: 'settleSelected' }));
      onLaneChange(nextLane);
    },
    [onLaneChange],
  );

  function toggleCategory(categoryId: LandscapeTickerCategoryId) {
    setSession((prev) =>
      reduceLandscapeTickerSession(prev, {
        type: 'toggle',
        categoryId,
        reducedMotion,
      }),
    );
  }

  function selectFamily(next: LandscapeTickerFamilyId) {
    setFamily(next);
  }

  const activeFamily = landscapeTickerFamilyById(family);
  const familyIndex = landscapeTickerFamilyIndex(family);
  const heading = family === 'free' ? `${trackLabel} ticker` : activeFamily.tickerName;
  const summary =
    selectedLabels.length === 0
      ? 'No rating categories selected. The plotting area is empty.'
      : `Selected categories: ${selectedLabels.join(', ')}. Use the chart and arrow keys to move between points, or the event list for finished games.`;
  const landscapeFit = isLandscapeFitBox(viewportBox);

  return (
    <div
      ref={dialogRef}
      className={`${styles.overlay} fixed inset-0 z-[400] flex max-h-[100dvh] max-w-[100dvw] flex-col overflow-hidden bg-[#070b10]/95 pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]`}
      style={{
        top: viewportBox.offsetTop,
        left: viewportBox.offsetLeft,
        width: viewportBox.width,
        height: viewportBox.height,
        right: 'auto',
        bottom: 'auto',
        ['--ticker-vvh' as string]: `${viewportBox.height}px`,
      }}
      data-testid="expanded-rating-ticker-drawer"
      data-landscape-ticker="true"
      data-compact-point-count={points.length}
      data-selected-count={session.selectedIds.length}
      data-hero-revealed-count={session.heroRevealedIds.length}
      data-active-reveal={session.activeReveal?.kind ?? 'none'}
      data-active-reveal-serial={session.activeReveal?.serial ?? 'none'}
      data-queued-count={session.pendingActivations.length}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      data-active-family={family}
      data-family-transition={reducedMotion ? 'none' : 'slide'}
      data-dominance-order={dominanceBackToFront.join(' ') || 'none'}
      data-dominant-category={dominantCategory ?? 'none'}
      data-landscape-fit={landscapeFit ? 'true' : 'false'}
      role="dialog"
      aria-modal="true"
      aria-labelledby="landscape-ticker-title"
      tabIndex={-1}
    >
      <header className={`${styles.header} flex shrink-0 items-center justify-between gap-2 border-b border-[#2f3f54] px-4 py-3`}>
        <div className="min-w-0 flex-1">
          <h3 id="landscape-ticker-title" className="m-0 truncate text-sm font-semibold text-white">
            {heading}
          </h3>
          {family === 'free' && typeof currentRating === 'number' ? (
            <p
              hidden={landscapeFit}
              className={`${styles.currentRating} m-0 mt-0.5 text-xs tabular-nums text-gray-400`}
            >
              Current {currentRating}
            </p>
          ) : null}
        </div>
        <LandscapeTickerFamilyPager family={family} onFamilyChange={selectFamily} />
        <button
          type="button"
          onClick={() => onCloseRef.current()}
          className="shrink-0 rounded-md border border-[#3d5168] px-3 py-1 text-sm text-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
          data-testid="expanded-ticker-close"
        >
          Close
        </button>
      </header>

      <div
        className={`${styles.bodyScroll} flex flex-col px-4 py-3`}
        data-testid="landscape-ticker-body-scroll"
      >
        <p
          hidden={landscapeFit}
          className={`${styles.orientationHint} m-0 shrink-0 text-xs text-gray-400`}
          data-testid="landscape-ticker-orientation-hint"
        >
          Rotate your device sideways for the full ticker. Portrait remains usable.
        </p>

        <div className={styles.familyViewport}>
          <div
            className={styles.familyTrack}
            data-testid="landscape-ticker-family-track"
            data-reduced-motion={reducedMotion ? 'true' : 'false'}
            style={{ transform: `translateX(-${familyIndex * (100 / LANDSCAPE_TICKER_FAMILIES.length)}%)` }}
          >
            {LANDSCAPE_TICKER_FAMILIES.map((item) => {
              const active = item.id === family;
              return (
                <div
                  key={item.id}
                  id={item.panelTestId}
                  role="tabpanel"
                  aria-labelledby={`${item.testId}-tab`}
                  aria-hidden={!active}
                  ref={(el) => {
                    syncNativeInert(el, !active);
                  }}
                  data-testid={item.panelTestId}
                  data-family={item.id}
                  className={styles.familyPanel}
                >
                  {item.id === 'free' ? (
                    <>
                      <div
                        className={styles.categoryControls}
                        data-testid="landscape-ticker-category-controls"
                        role="group"
                        aria-label="Rating categories"
                      >
                        {categoryLanePoints.map((cat) => {
                          const selected = isCategorySelected(session, cat.id);
                          const queued = isCategoryQueued(session, cat.id);
                          const dominant = dominantCategory === cat.id;
                          const subject = session.activeReveal?.categoryId === cat.id;
                          const count = cat.points.length;
                          const drawable = drawableById[cat.id] === true;
                          const carryIn =
                            typeof cat.carryInRating === 'number' &&
                            Number.isFinite(cat.carryInRating);
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              aria-pressed={selected}
                              data-testid={cat.testId}
                              data-selected={selected ? 'true' : 'false'}
                              data-queued={queued ? 'true' : 'false'}
                              data-dominant={dominant ? 'true' : 'false'}
                              data-subject={subject ? 'true' : 'false'}
                              data-point-count={count}
                              data-empty={count === 0 ? 'true' : 'false'}
                              data-drawable={drawable ? 'true' : 'false'}
                              data-carry-in={carryIn ? 'true' : 'false'}
                              data-hero-revealed={session.heroRevealedIds.includes(cat.id) ? 'true' : 'false'}
                              onClick={() => toggleCategory(cat.id)}
                              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                                selected
                                  ? 'bg-[#0f1723] text-gray-100'
                                  : 'border-[#23303f] text-gray-500 opacity-70'
                              }`}
                              style={
                                selected
                                  ? {
                                      borderColor: cat.color,
                                      color: cat.color,
                                      boxShadow:
                                        dominant || subject
                                          ? `0 0 0 1px ${cat.color}, 0 0 ${subject ? 10 : 6}px ${cat.color}66`
                                          : undefined,
                                    }
                                  : undefined
                              }
                            >
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: selected ? cat.color : '#4b5563' }}
                                aria-hidden="true"
                              />
                              {cat.label}
                              <span className="tabular-nums text-gray-500">({count})</span>
                              <span className="sr-only">{selected ? 'shown' : 'hidden'}</span>
                            </button>
                          );
                        })}
                      </div>

                      <div className={styles.laneTabs}>
                        <RatingLaneTabs
                          lane={lane}
                          onLaneChange={handleLaneChange}
                          testIdPrefix="rating"
                          ariaLabel="Rating history window"
                        />
                      </div>

                      <p
                        hidden={landscapeFit}
                        className={`${styles.seriesSummary} m-0 shrink-0 text-xs text-gray-400`}
                        data-testid="landscape-ticker-series-summary"
                      >
                        {summary}
                      </p>

                      <div className={styles.chartSlot}>
                        <LandscapeRatingTickerChart
                          series={chartSeries}
                          lane={lane}
                          timeZone={timeZone}
                          nowMs={nowMs}
                          window={laneWindow}
                          canLinkFinishedGames={canLinkFinishedGames}
                          reducedMotion={reducedMotion}
                          onRevealComplete={onRevealComplete}
                        />
                      </div>

                      {session.selectedIds.length > 0 && lanePoints.length === 0 ? (
                        <p className="m-0 shrink-0 text-xs text-gray-500" data-testid="rating-lane-empty">
                          {RATING_LANE_EMPTY}
                        </p>
                      ) : null}

                      <ol
                        hidden={landscapeFit}
                        className={`${styles.eventList} m-0 list-none space-y-2 p-0`}
                        data-testid="rating-ticker-point-list"
                        aria-label="Rating events for selected categories"
                      >
                        {lanePoints.map((p) => (
                          <li
                            key={p.id}
                            className="rounded-lg border border-[#2f3f54] bg-[#0f1723] px-3 py-2 text-sm text-gray-200"
                            data-testid="landscape-ticker-event-row"
                          >
                            <span className="tabular-nums" data-testid="landscape-ticker-event-delta">
                              {p.ratingBefore} {RATING_ARROW} {p.ratingAfter} ({p.ratingDelta >= 0 ? '+' : ''}
                              {p.ratingDelta})
                            </span>
                            <span className="mt-1 block text-xs text-gray-400" data-testid="landscape-ticker-event-meta">
                              {formatOccurredAtInZone(p.occurredAt, timeZone)} {META_DOT} {p.result}
                            </span>
                            <span className="mt-0.5 block text-[11px] text-gray-500" data-testid="landscape-ticker-event-iso">
                              {p.occurredAt}
                            </span>
                            {canLinkFinishedGames && p.gameId ? (
                              <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                                <Link
                                  href={finishedGameHref(p.gameId)}
                                  data-testid="landscape-ticker-list-finished-link"
                                  className="text-xs font-semibold text-sky-300"
                                >
                                  Finished game
                                </Link>
                                <Link
                                  href={finishedGameTrainHref(p.gameId)}
                                  data-testid="landscape-ticker-list-train-link"
                                  className="text-xs font-semibold text-sky-300"
                                >
                                  Trainer review
                                </Link>
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    </>
                  ) : (
                    <div
                      className={styles.familyUnavailable}
                      data-testid={`landscape-ticker-family-unavailable-${item.id}`}
                      data-fabricated="false"
                    >
                      <p className="m-0 text-sm font-semibold text-white">{item.tickerName}</p>
                      <p className="m-0 mt-2 max-w-md text-xs text-gray-400">{item.unavailableDetail}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
