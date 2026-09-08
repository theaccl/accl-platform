'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import {
  activeCompareTickers,
  addCompareTicker,
  compareEventLinks,
  createCompareSession,
  ctPeriod,
  isRealGameEvent,
  periodOccupancy,
  rankedSeriesOrder,
  removeCompareTicker,
  reopenCompareSessionForUtcDay,
  setCtAnchor,
  setMainLane,
  stepCtPeriod,
  type ComparePeriod,
  type CompareSessionState,
  type CompareTickerSlot,
} from '@/lib/profile/compareMode';
import type { CompareTickerPeriodLoad } from '@/lib/profile/loadCompareTickerPeriod';
import type { RatingLaneWindow } from '@/lib/profile/ratingTickerCalendar';
import { RATING_TICKER_DISPLAY_TIME_ZONE } from '@/lib/profile/ratingTickerTimeZone';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';
import type { RatingLane } from '@/lib/ratingHistoryMetrics';
import { RatingTickerChart } from '@/components/profile/ratings/RatingTickerChart';

export type ComparePeriodLoader = (
  period: ComparePeriod,
  slot: CompareTickerSlot,
) => Promise<CompareTickerPeriodLoad>;

type Props = {
  lane: RatingLane;
  isSelf: boolean;
  canLinkFinishedGames: boolean;
  gamePickerPoints: RatingHistoryPoint[];
  children: ReactNode;
  loadPeriod: ComparePeriodLoader;
};

function asLaneWindow(period: ComparePeriod): RatingLaneWindow {
  const startDate = new Date(period.startMs);
  const endDate = new Date(period.endMs - 1);
  const month = (date: Date) => date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  let caption: string;
  if (period.lane === 'day') {
    caption = `${month(startDate)} ${startDate.getUTCDate()}, ${startDate.getUTCFullYear()} · UTC`;
  } else if (period.lane === 'week' && period.isoWeek) {
    caption = `${period.isoWeek.isoWeekYear} · ISO W${String(period.isoWeek.isoWeek).padStart(2, '0')} · ${month(startDate)} ${startDate.getUTCDate()}–${month(endDate)} ${endDate.getUTCDate()} · UTC`;
  } else if (period.lane === 'month') {
    caption = `${month(startDate)} ${startDate.getUTCFullYear()} · UTC`;
  } else {
    caption = `${startDate.getUTCFullYear()} · Jan–Dec · UTC`;
  }
  return {
    lane: period.lane,
    timeZone: period.timeZone,
    startMs: period.startMs,
    endMs: period.endMs,
    caption,
    isoWeek: period.isoWeek,
  };
}

function utcInputValue(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function eventLabel(point: RatingHistoryPoint): string {
  const family = point.mode ?? point.ratingTrackId;
  const control = point.timeControl ? ` · ${point.timeControl}` : '';
  const opponent = point.opponentUsername ? ` · vs ${point.opponentUsername}` : '';
  return `${point.occurredAt.slice(0, 16).replace('T', ' ')} UTC · ${family}${control}${opponent}`;
}

export function CompactCompareMode({
  lane,
  isSelf,
  canLinkFinishedGames,
  gamePickerPoints,
  children,
  loadPeriod,
}: Props) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<CompareSessionState>(() =>
    createCompareSession(lane, Date.now()),
  );
  const [loads, setLoads] = useState<Partial<Record<CompareTickerSlot, CompareTickerPeriodLoad>>>({});
  const [activePanel, setActivePanel] = useState(0);
  const mainPanelRef = useRef<HTMLElement | null>(null);
  const panelRefs = useRef<Partial<Record<CompareTickerSlot, HTMLElement | null>>>({});

  useEffect(() => setSession((previous) => setMainLane(previous, lane)), [lane]);

  const orderedCts = useMemo(() => {
    const order = rankedSeriesOrder(session).filter((id): id is CompareTickerSlot => id !== 'main');
    return order.map((slot) => session.cts.find((ct) => ct.slot === slot)!).filter(Boolean);
  }, [session]);

  useEffect(() => {
    let cancelled = false;
    if (!open || lane === 'overall') return () => { cancelled = true; };
    const activeSlots = activeCompareTickers(session).map((ct) => ct.slot);
    setLoads((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([slot]) => !activeSlots.includes(slot as CompareTickerSlot)),
      ),
    );
    for (const ct of activeCompareTickers(session)) {
      const period = ctPeriod(session, ct.slot, RATING_TICKER_DISPLAY_TIME_ZONE);
      if (!period) continue;
      const runner = loadPeriod(period, ct.slot);
      void runner
        .then((result) => {
          if (!cancelled) setLoads((previous) => ({ ...previous, [ct.slot]: result }));
        })
        .catch(() => {
          if (!cancelled) {
            setLoads((previous) => ({
              ...previous,
              [ct.slot]: {
                status: 'incomplete',
                points: [],
                coverage: {
                  startMs: period.startMs,
                  endMs: period.startMs,
                  priorToStartResolved: false,
                },
                message: 'This historical period could not be fully verified.',
              },
            }));
          }
        });
    }
    return () => { cancelled = true; };
  }, [lane, loadPeriod, open, session]);

  if (!isSelf) return <>{children}</>;

  function apply(result: ReturnType<typeof addCompareTicker>) {
    if (result.ok) setSession(result.state);
  }

  function addTicker() {
    const currentMs = Date.now();
    setNowMs(currentMs);
    apply(addCompareTicker(session, currentMs, currentMs, RATING_TICKER_DISPLAY_TIME_ZONE));
    setOpen(true);
  }

  function openExistingSession() {
    const currentMs = Date.now();
    setNowMs(currentMs);
    setSession((previous) => reopenCompareSessionForUtcDay(previous, currentMs));
    setActivePanel(0);
    setOpen(true);
  }

  function updateAnchor(slot: CompareTickerSlot, ms: number) {
    apply(setCtAnchor(session, slot, ms, nowMs, RATING_TICKER_DISPLAY_TIME_ZONE));
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
    .filter((point) => isRealGameEvent(point) && Date.parse(point.occurredAt) <= nowMs)
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
            onClick={open ? () => setOpen(false) : orderedCts.length ? openExistingSession : addTicker}
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
              const loaded = loads[ct.slot];
              const occupancy = loaded
                ? periodOccupancy(loaded.points, period, loaded.coverage)
                : null;
              const periodPoints = loaded?.points.filter((point) => {
                const t = Date.parse(point.occurredAt);
                return t >= period.startMs && t < period.endMs;
              }) ?? [];
              const periodCurrentRating =
                periodPoints[periodPoints.length - 1]?.ratingAfter ?? occupancy?.carryInRating ?? null;
              return (
                <article
                  key={ct.slot}
                  ref={(node) => { panelRefs.current[ct.slot] = node; }}
                  className="w-[min(100%,38rem)] min-w-[min(100%,22rem)] shrink-0 snap-start space-y-3 rounded-xl border border-[#3d5168] bg-[#0f1723] p-3"
                  data-testid={`compare-panel-${ct.slot}`}
                >
                  <header className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h5 className="m-0 font-semibold text-white">{ct.slot.toUpperCase()} · rank {ct.rank}</h5>
                      <p className="m-0 text-xs text-gray-400">{asLaneWindow(period).caption}</p>
                      <p className="m-0 text-xs text-gray-300" data-testid={`compare-summary-${ct.slot}`}>
                        {loaded?.status === 'complete' && occupancy
                          ? `${occupancy.games} games · ${occupancy.ratingEvents} rating events${occupancy.netRatingChange == null ? '' : ` · ${occupancy.netRatingChange >= 0 ? '+' : ''}${occupancy.netRatingChange}`}`
                          : 'Coverage incomplete — totals withheld'}
                      </p>
                    </div>
                    <button type="button" onClick={() => apply(removeCompareTicker(session, ct.slot))} aria-label={`Remove ${ct.slot.toUpperCase()}`}>Remove</button>
                  </header>
                  <div className="flex flex-wrap items-end gap-2">
                    <button type="button" onClick={() => apply(stepCtPeriod(session, ct.slot, 'prev', nowMs))}>Previous period</button>
                    <label className="text-xs text-gray-300">
                      UTC date
                      <input
                        type="date"
                        value={utcInputValue(ct.anchorMs)}
                        max={utcInputValue(nowMs)}
                        onChange={(event) => updateAnchor(ct.slot, Date.parse(`${event.target.value}T00:00:00Z`))}
                        className="ml-2 rounded border border-[#3d5168] bg-[#0b121c] p-2"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={period.endMs > nowMs}
                      onClick={() => apply(stepCtPeriod(session, ct.slot, 'next', nowMs))}
                    >
                      Next period
                    </button>
                  </div>
                  <details>
                    <summary className="cursor-pointer text-sm font-semibold text-sky-300">Choose from games</summary>
                    {games.length ? (
                      <ul className="max-h-56 space-y-2 overflow-y-auto pl-5">
                        {games.map((game) => {
                          const links = compareEventLinks(game);
                          return (
                            <li key={game.id} className="text-xs text-gray-300">
                              <button type="button" onClick={() => updateAnchor(ct.slot, Date.parse(game.occurredAt))}>
                                {eventLabel(game)} · {game.result} · {game.ratingBefore} → {game.ratingAfter} ({game.ratingDelta >= 0 ? '+' : ''}{game.ratingDelta})
                              </button>
                              {canLinkFinishedGames && links.openGameHref ? (
                                <span className="ml-2 inline-flex gap-2">
                                  <Link href={links.openGameHref}>Open game</Link>
                                  <Link href={links.trainerReviewHref!}>Trainer review</Link>
                                </span>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : <p className="text-xs text-gray-500">No loaded finished games.</p>}
                  </details>
                  {!loaded ? <p className="text-xs text-gray-400">Loading verified history…</p> : null}
                  {loaded?.message ? <p className="text-xs text-amber-300">{loaded.message}</p> : null}
                  {loaded ? (
                    <RatingTickerChart
                      points={periodPoints}
                      currentRating={periodCurrentRating}
                      canLinkFinishedGames={canLinkFinishedGames}
                      lane={period.lane}
                      window={asLaneWindow(period)}
                      carryInRating={occupancy?.coverage === 'complete' ? occupancy.carryInRating : null}
                    />
                  ) : null}
                </article>
              );
            })}
          </>
        ) : null}
      </div>
    </section>
  );
}
