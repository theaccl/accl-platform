'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  MAJOR_FAMILY_COMPARISON_SERIES,
  buildMajorFamilySeriesData,
  type MajorFamilyTrackId,
} from '@/lib/profileRatingChartLevels';
import {
  applyActivationToggle,
  paintedActivationOrder,
} from '@/lib/profile/ratingLineDominanceOrder';
import {
  filterMajorFamilySeriesByLane,
  majorFamilySeriesHasAnyPoints,
} from '@/lib/profileRatingFamilyComparison';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';
import {
  DEFAULT_RATING_LANE,
  lastRatingAfterBefore,
  type RatingLane,
} from '@/lib/ratingHistoryMetrics';
import { ratingLaneWindow } from '@/lib/profile/ratingTickerCalendar';
import { RATING_TICKER_DISPLAY_TIME_ZONE } from '@/lib/profile/ratingTickerTimeZone';
import { ExpandedRatingTickerDrawer } from '@/components/profile/ratings/ExpandedRatingTickerDrawer';
import styles from '@/components/profile/ratings/landscapeRatingTicker.module.css';
import { RatingLaneTabs } from '@/components/profile/ratings/RatingLaneTabs';
import { MultiLineRatingTickerChart } from '@/components/profile/ratings/MultiLineRatingTickerChart';
import {
  COMPARISON_SELECT_EMPTY,
  RATING_LANE_EMPTY,
} from '@/components/profile/ratings/ratingTickerEmptyStates';

const COMPARISON_EMPTY =
  'Major-family comparison will appear here after finished rated games are recorded for these tracks.';

type Props = {
  historyByTrack: Record<string, RatingHistoryPoint[]>;
  canLinkFinishedGames: boolean;
};

export function RatingFamilyComparisonPanel({ historyByTrack, canLinkFinishedGames }: Props) {
  const [lane, setLane] = useState<RatingLane>(DEFAULT_RATING_LANE);
  const [dominanceOrder, setDominanceOrder] = useState<MajorFamilyTrackId[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [nowMs] = useState(() => Date.now());
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const baseSeries = useMemo(() => buildMajorFamilySeriesData(historyByTrack), [historyByTrack]);
  const laneSeries = useMemo(
    () =>
      filterMajorFamilySeriesByLane(
        baseSeries,
        lane,
        nowMs,
        RATING_TICKER_DISPLAY_TIME_ZONE,
      ),
    [baseSeries, lane, nowMs],
  );
  const laneWindow = useMemo(() => {
    const times = baseSeries
      .flatMap((series) => series.points)
      .map((point) => Date.parse(point.occurredAt))
      .filter((time) => Number.isFinite(time));
    return ratingLaneWindow(lane, nowMs, RATING_TICKER_DISPLAY_TIME_ZONE, {
      firstEventMs: times.length ? Math.min(...times) : null,
      lastEventMs: times.length ? Math.max(...times) : null,
    });
  }, [baseSeries, lane, nowMs]);
  const carryInRatings = useMemo(
    () =>
      Object.fromEntries(
        baseSeries.map((series) => [
          series.trackId,
          lane === 'overall' || !laneWindow
            ? null
            : lastRatingAfterBefore(series.points, laneWindow.startMs),
        ]),
      ),
    [baseSeries, lane, laneWindow],
  );
  const visibleTrackIds = useMemo(() => new Set(dominanceOrder), [dominanceOrder]);
  const paintedIds = useMemo(
    () =>
      paintedActivationOrder(
        dominanceOrder,
        Object.fromEntries(laneSeries.map((s) => [s.trackId, s.points.length])),
      ),
    [dominanceOrder, laneSeries],
  );
  const paintedDominantCategory = paintedIds[paintedIds.length - 1] ?? null;

  const anyBasePoints = majorFamilySeriesHasAnyPoints(baseSeries);
  const canExpandLandscape =
    anyBasePoints || Object.values(historyByTrack).some((pts) => (pts?.length ?? 0) > 0);
  const renderedPointCount = useMemo(
    () =>
      laneSeries
        .filter((s) => visibleTrackIds.has(s.trackId))
        .reduce((n, s) => n + s.points.length, 0),
    [laneSeries, visibleTrackIds],
  );
  const selectedDrawableCount = useMemo(
    () =>
      laneSeries.filter(
        (series) =>
          visibleTrackIds.has(series.trackId) &&
          (series.points.length > 0 || carryInRatings[series.trackId] != null),
      ).length,
    [carryInRatings, laneSeries, visibleTrackIds],
  );

  function toggleTrack(trackId: MajorFamilyTrackId) {
    setDominanceOrder((prev) => applyActivationToggle(prev, trackId, !prev.includes(trackId)));
  }

  return (
    <div
      data-testid="rating-family-comparison-panel"
      data-empty-open={dominanceOrder.length === 0 ? 'true' : 'false'}
      data-dominance-order={dominanceOrder.join(' ') || 'none'}
      data-dominant-category={paintedDominantCategory ?? 'none'}
      className="space-y-3 rounded-xl border border-[#2f3f54] bg-[#0b121c] p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-semibold text-white">Compare major ratings</h3>
        {canExpandLandscape ? (
          <button
            type="button"
            className={`${styles.expandMobile} shrink-0 rounded-md border border-[#3d5168] px-2 py-1 text-xs text-gray-300`}
            data-testid="rating-comparison-expand-mobile"
            onClick={() => setDrawerOpen(true)}
          >
            Expand
          </button>
        ) : null}
      </div>

      <p className="m-0 text-xs text-gray-500">
        Tournament, Bullet, Blitz, Rapid, and Daily mode histories — one line per family, real ledger
        events only.
      </p>

      {/* Persistent legend with hide / show toggles */}
      <ul
        className="m-0 flex list-none flex-wrap gap-2 p-0"
        data-testid="major-family-legend"
        aria-label="Major rating families"
      >
        {MAJOR_FAMILY_COMPARISON_SERIES.map((def) => {
          const visible = visibleTrackIds.has(def.trackId);
          const count = laneSeries.find((s) => s.trackId === def.trackId)?.points.length ?? 0;
          return (
            <li key={def.trackId}>
              <button
                type="button"
                data-testid={def.legendTestId}
                data-visible={visible ? 'true' : 'false'}
                data-point-count={count}
                aria-pressed={visible}
                onClick={() => toggleTrack(def.trackId)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-opacity ${
                  visible
                    ? 'border-[#3d5168] text-gray-200'
                    : 'border-[#23303f] text-gray-500 opacity-60'
                }`}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: def.color }}
                  data-series-color={def.color}
                />
                {def.label}
                <span className="tabular-nums text-gray-500">({count})</span>
              </button>
            </li>
          );
        })}
      </ul>

      <RatingLaneTabs
        lane={lane}
        onLaneChange={setLane}
        testIdPrefix="comparison"
        ariaLabel="Comparison history window"
      />

      {!anyBasePoints ? (
        <p className="m-0 text-sm text-gray-400" data-testid="comparison-empty-all">
          {COMPARISON_EMPTY}
        </p>
      ) : dominanceOrder.length === 0 ? (
        <p className="m-0 text-xs text-gray-500" data-testid="comparison-all-hidden">
          {COMPARISON_SELECT_EMPTY}
        </p>
      ) : selectedDrawableCount === 0 ? (
        <p className="m-0 text-xs text-gray-500" data-testid="comparison-lane-empty">
          {RATING_LANE_EMPTY}
        </p>
      ) : (
        <>
          <MultiLineRatingTickerChart
            series={laneSeries}
            visibleTrackIds={visibleTrackIds}
            dominanceOrder={dominanceOrder}
            canLinkFinishedGames={canLinkFinishedGames}
            lane={lane}
            window={laneWindow}
            carryInRatings={carryInRatings}
          />
          {renderedPointCount === 0 ? (
            <p className="m-0 text-xs text-gray-500" data-testid="comparison-lane-empty">
              {RATING_LANE_EMPTY}
            </p>
          ) : null}
        </>
      )}

      <ExpandedRatingTickerDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        trackLabel="Free"
        currentRating={null}
        points={[]}
        lane={lane}
        onLaneChange={setLane}
        canLinkFinishedGames={canLinkFinishedGames}
        historyByTrack={historyByTrack}
      />
    </div>
  );
}
