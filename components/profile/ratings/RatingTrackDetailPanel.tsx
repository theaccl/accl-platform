'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PlayerBadgeStateRow } from '@/lib/badgeSettlement';
import { timeControlByRatingTrackId } from '@/lib/acclTimeControls';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';
import {
  DEFAULT_RATING_LANE,
  filterPointsByLane,
  lastRatingAfterBefore,
  type RatingLane,
} from '@/lib/ratingHistoryMetrics';
import { ratingLaneWindow } from '@/lib/profile/ratingTickerCalendar';
import { RATING_TICKER_DISPLAY_TIME_ZONE } from '@/lib/profile/ratingTickerTimeZone';
import { LANDSCAPE_TICKER_CATEGORIES } from '@/lib/profile/landscapeTickerCategories';
import {
  MAJOR_FAMILY_COMPARISON_SERIES,
  buildMajorFamilySeriesData,
  type MajorFamilyTrackId,
} from '@/lib/profileRatingChartLevels';
import { applyActivationToggle } from '@/lib/profile/ratingLineDominanceOrder';
import { BadgeBoundaryPanel } from '@/components/profile/ratings/BadgeBoundaryPanel';
import { ExpandedRatingTickerDrawer } from '@/components/profile/ratings/ExpandedRatingTickerDrawer';
import { ExpandedIndependentCompareDrawer } from '@/components/profile/ratings/ExpandedIndependentCompareDrawer';
import styles from '@/components/profile/ratings/landscapeRatingTicker.module.css';
import { RatingLaneTabs } from '@/components/profile/ratings/RatingLaneTabs';
import { RatingTickerChart } from '@/components/profile/ratings/RatingTickerChart';
import { MultiLineRatingTickerChart } from '@/components/profile/ratings/MultiLineRatingTickerChart';
import {
  CompactCompareMode,
  type ComparePeriodLoader,
} from '@/components/profile/ratings/CompactCompareMode';
import {
  activeCompareTickers,
  compareAnchorPeriod,
  createCompareSession,
  ctPeriod,
  reopenCompareSessionForUtcDay,
  setMainLane,
  type CompareBucketLane,
  type CompareSeriesId,
  type CompareTickerSlot,
} from '@/lib/profile/compareMode';
import type { CompareTickerPeriodLoad } from '@/lib/profile/loadCompareTickerPeriod';
import {
  exactTrackHistoryEmptyLabel,
  RATING_EXACT_SELF_ONLY,
  RATING_LANE_EMPTY,
} from '@/components/profile/ratings/ratingTickerEmptyStates';

type Props = {
  trackLabel: string;
  ratingTrackId: string;
  currentRating: number | null;
  points: RatingHistoryPoint[];
  badge: PlayerBadgeStateRow | null | undefined;
  isSelf: boolean;
  canLinkFinishedGames: boolean;
  historyByTrack?: Record<string, RatingHistoryPoint[]>;
  comparePeriodLoader?: ComparePeriodLoader;
  lane: RatingLane;
  onLaneChange: (lane: RatingLane) => void;
};

type ComparePeriodLoadEntry = {
  loadKey: string;
  lane: Exclude<RatingLane, 'overall'>;
  startMs: number;
  endMs: number;
  load: CompareTickerPeriodLoad;
};

export function RatingTrackDetailPanel({
  trackLabel,
  ratingTrackId,
  currentRating,
  points,
  badge,
  isSelf,
  canLinkFinishedGames,
  historyByTrack = {},
  comparePeriodLoader,
  lane,
  onLaneChange,
}: Props) {
  const def = timeControlByRatingTrackId(ratingTrackId);
  const isExact = Boolean(def?.badgeTrackKey);
  const showBadgeUnavailable = isExact && !isSelf;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<'landscape' | 'independent'>('landscape');
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareNowMs, setCompareNowMs] = useState(() => Date.now());
  const [compareSession, setCompareSession] = useState(() =>
    createCompareSession(DEFAULT_RATING_LANE, Date.now()),
  );
  const [compareLoadEntries, setCompareLoadEntries] = useState<
    Partial<Record<CompareSeriesId, ComparePeriodLoadEntry>>
  >({});
  const [acclSupplementalOrder, setAcclSupplementalOrder] = useState<MajorFamilyTrackId[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const refreshComparisonNow = useCallback((currentMs: number) => {
    setCompareNowMs(currentMs);
    setNowMs(currentMs);
  }, []);
  const changeLane = useCallback((nextLane: RatingLane) => {
    onLaneChange(nextLane);
    setCompareSession((previous) => setMainLane(previous, nextLane));
  }, [onLaneChange]);
  const isAcclTicker = ratingTrackId === 'accl';

  const majorBaseSeries = useMemo(
    () => buildMajorFamilySeriesData(historyByTrack),
    [historyByTrack],
  );
  const selectedAcclBaseSeries = useMemo(() => {
    const accl = LANDSCAPE_TICKER_CATEGORIES.find((category) => category.id === 'accl')!;
    return [
      { trackId: 'accl', label: 'ACCL', color: accl.color, points: [...points] },
      ...majorBaseSeries.filter((series) => acclSupplementalOrder.includes(series.trackId)),
    ];
  }, [acclSupplementalOrder, majorBaseSeries, points]);
  const basePointsForWindow = useMemo(
    () =>
      isAcclTicker
        ? selectedAcclBaseSeries.flatMap((series) => series.points)
        : points,
    [isAcclTicker, points, selectedAcclBaseSeries],
  );

  const laneWindow = useMemo(() => {
    const times = basePointsForWindow
      .map((point) => Date.parse(point.occurredAt))
      .filter((time) => Number.isFinite(time));
    return ratingLaneWindow(lane, nowMs, RATING_TICKER_DISPLAY_TIME_ZONE, {
      firstEventMs: times.length ? Math.min(...times) : null,
      lastEventMs: times.length ? Math.max(...times) : null,
    });
  }, [basePointsForWindow, lane, nowMs]);
  const lanePoints = useMemo(
    () => filterPointsByLane(points, lane, nowMs, RATING_TICKER_DISPLAY_TIME_ZONE),
    [points, lane, nowMs],
  );
  const carryInRating = useMemo(
    () =>
      lane === 'overall' || !laneWindow
        ? null
        : lastRatingAfterBefore(points, laneWindow.startMs),
    [lane, laneWindow, points],
  );
  const acclLaneSeries = useMemo(
    () =>
      selectedAcclBaseSeries.map((series) => ({
        ...series,
        points: filterPointsByLane(
          series.points,
          lane,
          nowMs,
          RATING_TICKER_DISPLAY_TIME_ZONE,
        ),
      })),
    [lane, nowMs, selectedAcclBaseSeries],
  );
  const acclCarryInRatings = useMemo(
    () =>
      Object.fromEntries(
        selectedAcclBaseSeries.map((series) => [
          series.trackId,
          lane === 'overall' || !laneWindow
            ? null
            : lastRatingAfterBefore(series.points, laneWindow.startMs),
        ]),
      ),
    [lane, laneWindow, selectedAcclBaseSeries],
  );
  const majorLaneCounts = useMemo(
    () =>
      new Map(
        majorBaseSeries.map((series) => [
          series.trackId,
          filterPointsByLane(
            series.points,
            lane,
            nowMs,
            RATING_TICKER_DISPLAY_TIME_ZONE,
          ).length,
        ]),
      ),
    [lane, majorBaseSeries, nowMs],
  );
  const compareGamePickerPoints = useMemo(() => {
    const unique = new Map<string, RatingHistoryPoint>();
    for (const point of Object.values(historyByTrack).flat()) {
      const key = point.gameId ? `game:${point.gameId}` : `event:${point.id}`;
      if (!unique.has(key)) unique.set(key, point);
    }
    return [...unique.values()];
  }, [historyByTrack]);
  const compareLoads = useMemo(() => {
    const current: Partial<Record<CompareTickerSlot, CompareTickerPeriodLoad>> = {};
    for (const ticker of activeCompareTickers(compareSession)) {
      const period = ctPeriod(compareSession, ticker.slot, RATING_TICKER_DISPLAY_TIME_ZONE);
      const entry = compareLoadEntries[ticker.slot];
      if (
        period &&
        entry &&
        entry.loadKey === ratingTrackId &&
        entry.lane === period.lane &&
        entry.startMs === period.startMs &&
        entry.endMs === period.endMs
      ) {
        current[ticker.slot] = entry.load;
      }
    }
    return current;
  }, [compareLoadEntries, compareSession, ratingTrackId]);
  const mainCompareLoad = useMemo(() => {
    if (lane === 'overall') return undefined;
    const period = compareAnchorPeriod(
      lane,
      compareNowMs,
      RATING_TICKER_DISPLAY_TIME_ZONE,
    );
    const entry = compareLoadEntries.main;
    return period &&
      entry &&
      entry.loadKey === ratingTrackId &&
      entry.lane === period.lane &&
      entry.startMs === period.startMs &&
      entry.endMs === period.endMs
      ? entry.load
      : undefined;
  }, [compareLoadEntries.main, compareNowMs, lane, ratingTrackId]);
  const compareSessionCts = compareSession.cts;
  const compareSessionLane = compareSession.lane;

  useEffect(() => {
    let cancelled = false;
    const surfaceActive = compareOpen || (drawerOpen && drawerMode === 'independent');
    if (!comparePeriodLoader || !surfaceActive || lane === 'overall') {
      return () => { cancelled = true; };
    }
    const requested: Array<{ seriesId: CompareSeriesId; period: NonNullable<ReturnType<typeof compareAnchorPeriod>> }> = [];
    if (drawerOpen && drawerMode === 'independent') {
      const mainPeriod = compareAnchorPeriod(
        lane,
        compareNowMs,
        RATING_TICKER_DISPLAY_TIME_ZONE,
      );
      if (mainPeriod) requested.push({ seriesId: 'main', period: mainPeriod });
    }
    for (const ticker of compareSessionLane === 'overall' ? [] : compareSessionCts) {
      const period = compareAnchorPeriod(
        compareSessionLane as CompareBucketLane,
        ticker.anchorMs,
        RATING_TICKER_DISPLAY_TIME_ZONE,
      );
      if (period) requested.push({ seriesId: ticker.slot, period });
    }
    const requestedIds = requested.map(({ seriesId }) => seriesId);
    setCompareLoadEntries((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([seriesId, entry]) =>
          requestedIds.includes(seriesId as CompareSeriesId) && entry.loadKey === ratingTrackId,
        ),
      ),
    );
    for (const { seriesId, period } of requested) {
      void comparePeriodLoader(period, seriesId)
        .then((result) => {
          if (!cancelled) {
            setCompareLoadEntries((previous) => ({
              ...previous,
              [seriesId]: {
                loadKey: ratingTrackId,
                lane: period.lane,
                startMs: period.startMs,
                endMs: period.endMs,
                load: result,
              },
            }));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setCompareLoadEntries((previous) => ({
              ...previous,
              [seriesId]: {
                loadKey: ratingTrackId,
                lane: period.lane,
                startMs: period.startMs,
                endMs: period.endMs,
                load: {
                  status: 'incomplete',
                  points: [],
                  coverage: {
                    startMs: period.startMs,
                    endMs: period.startMs,
                    priorToStartResolved: false,
                  },
                  message: 'This historical period could not be fully verified.',
                },
              },
            }));
          }
        });
    }
    return () => { cancelled = true; };
  }, [compareNowMs, compareOpen, comparePeriodLoader, compareSessionCts, compareSessionLane, drawerMode, drawerOpen, lane, ratingTrackId]);
  const useAcclMultiLine = isAcclTicker && acclSupplementalOrder.length > 0;
  const acclDominanceOrder = useMemo(
    () => ['accl', ...acclSupplementalOrder],
    [acclSupplementalOrder],
  );
  const acclVisibleTrackIds = useMemo(
    () => new Set(acclDominanceOrder),
    [acclDominanceOrder],
  );
  const allEmpty = basePointsForWindow.length === 0;
  const acclLaneDrawable =
    acclLaneSeries.some((series) => series.points.length > 0) ||
    Object.values(acclCarryInRatings).some((rating) => rating != null);
  const laneEmpty =
    !allEmpty &&
    (useAcclMultiLine
      ? acclLaneSeries.every((series) => series.points.length === 0)
      : lanePoints.length === 0);
  const laneDrawable = useAcclMultiLine
    ? acclLaneDrawable
    : lanePoints.length > 0 || carryInRating != null;
  const exactEmptyHistory = isExact && isSelf && allEmpty;
  const canExpandLandscape =
    points.length > 0 ||
    LANDSCAPE_TICKER_CATEGORIES.some((cat) => (historyByTrack[cat.trackId]?.length ?? 0) > 0);

  function toggleAcclSupplement(trackId: MajorFamilyTrackId) {
    setAcclSupplementalOrder((previous) =>
      applyActivationToggle(previous, trackId, !previous.includes(trackId)),
    );
  }

  function openDrawer() {
    const currentMs = Date.now();
    const reopened = comparePeriodLoader && !compareOpen
      ? reopenCompareSessionForUtcDay(compareSession, currentMs)
      : compareSession;
    setCompareNowMs(currentMs);
    setNowMs(currentMs);
    setCompareSession(reopened);
    setDrawerMode(
      comparePeriodLoader && (
        compareOpen || (lane !== 'overall' && activeCompareTickers(reopened).length > 0)
      )
        ? 'independent'
        : 'landscape',
    );
    setDrawerOpen(true);
  }

  const mainFamilyControls = isAcclTicker ? (
    <ul
      className="m-0 flex list-none flex-wrap gap-2 p-0"
      data-testid="accl-ticker-major-family-options"
      aria-label="Add major rating families to the ACCL ticker"
    >
      {MAJOR_FAMILY_COMPARISON_SERIES.map((series) => {
        const selected = acclSupplementalOrder.includes(series.trackId);
        return (
          <li key={series.trackId}>
            <button
              type="button"
              data-testid={`accl-ticker-option-${series.trackId}`}
              data-point-count={majorLaneCounts.get(series.trackId) ?? 0}
              aria-pressed={selected}
              onClick={() => toggleAcclSupplement(series.trackId)}
              className={`flex min-h-9 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-opacity ${
                selected
                  ? 'border-[#3d5168] text-gray-200'
                  : 'border-[#23303f] text-gray-500 opacity-60'
              }`}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: series.color }}
                aria-hidden="true"
              />
              {series.label}
              <span className="tabular-nums text-gray-500">
                ({majorLaneCounts.get(series.trackId) ?? 0})
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  ) : null;

  const mainTicker = (
    <>
      {laneEmpty && !laneDrawable ? (
        <p className="m-0 text-xs text-gray-500" data-testid="rating-lane-empty">
          {RATING_LANE_EMPTY}
        </p>
      ) : useAcclMultiLine ? (
        <MultiLineRatingTickerChart
          series={acclLaneSeries}
          visibleTrackIds={acclVisibleTrackIds}
          dominanceOrder={acclDominanceOrder}
          canLinkFinishedGames={canLinkFinishedGames}
          lane={lane}
          window={laneWindow}
          carryInRatings={acclCarryInRatings}
        />
      ) : (
        <RatingTickerChart
          points={lanePoints}
          currentRating={currentRating}
          canLinkFinishedGames={canLinkFinishedGames}
          lane={lane}
          window={laneWindow}
          carryInRating={carryInRating}
        />
      )}
      {laneEmpty && laneDrawable ? (
        <p className="m-0 text-xs text-gray-500" data-testid="rating-lane-empty">
          {RATING_LANE_EMPTY}
        </p>
      ) : null}
    </>
  );
  const mainLaneControls = (
    <RatingLaneTabs
      lane={lane}
      onLaneChange={changeLane}
      testIdPrefix="rating"
      ariaLabel="Rating history window"
    />
  );

  return (
    <div data-testid="rating-track-detail-panel" className="space-y-3 rounded-xl border border-[#2f3f54] bg-[#0b121c] p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-semibold text-white">{trackLabel} ticker</h3>
        {canExpandLandscape ? (
          <button
            type="button"
            className={`${styles.expandAlways} shrink-0 rounded-md border border-[#3d5168] px-2 py-1 text-xs text-gray-300`}
            data-testid="rating-ticker-expand-mobile"
            onClick={openDrawer}
          >
            Expand
          </button>
        ) : null}
      </div>
      {!isSelf && isExact ? (
        <p className="m-0 text-xs text-gray-500">{RATING_EXACT_SELF_ONLY}</p>
      ) : null}

      {!comparePeriodLoader ? mainFamilyControls : null}
      {exactEmptyHistory ? (
        <p className="m-0 text-xs text-gray-500" data-testid="rating-exact-track-history-empty">
          {exactTrackHistoryEmptyLabel(trackLabel)}
        </p>
      ) : null}

      {!comparePeriodLoader ? mainLaneControls : null}

      {comparePeriodLoader ? (
        <CompactCompareMode
          lane={lane}
          isSelf={isSelf}
          canLinkFinishedGames={canLinkFinishedGames}
          gamePickerPoints={compareGamePickerPoints}
          open={compareOpen}
          onOpenChange={setCompareOpen}
          session={compareSession}
          onSessionChange={setCompareSession}
          loads={compareLoads}
          nowMs={compareNowMs}
          onNowMsChange={refreshComparisonNow}
        >
          {mainFamilyControls}
          {mainLaneControls}
          {mainTicker}
        </CompactCompareMode>
      ) : mainTicker}

      <BadgeBoundaryPanel badge={badge} showUnavailable={showBadgeUnavailable || (isSelf && isExact)} />
      {drawerMode === 'independent' ? (
        <ExpandedIndependentCompareDrawer
          open={drawerOpen}
          onClose={closeDrawer}
          trackLabel={trackLabel}
          lane={lane}
          onLaneChange={changeLane}
          canLinkFinishedGames={canLinkFinishedGames}
          gamePickerPoints={compareGamePickerPoints}
          session={compareSession}
          loads={compareLoads}
          mainLoad={mainCompareLoad}
          nowMs={compareNowMs}
          onSessionChange={setCompareSession}
          mainFamilyControls={mainFamilyControls}
          mainTicker={mainTicker}
          mainColor={
            LANDSCAPE_TICKER_CATEGORIES.find((category) => category.trackId === ratingTrackId)?.color
              ?? '#38bdf8'
          }
        />
      ) : (
        <ExpandedRatingTickerDrawer
          open={drawerOpen}
          onClose={closeDrawer}
          trackLabel={trackLabel}
          currentRating={currentRating}
          points={points}
          lane={lane}
          onLaneChange={changeLane}
          canLinkFinishedGames={canLinkFinishedGames}
          historyByTrack={historyByTrack}
        />
      )}
    </div>
  );
}
