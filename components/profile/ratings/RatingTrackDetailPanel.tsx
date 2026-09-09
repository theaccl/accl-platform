'use client';

import { useCallback, useMemo, useState } from 'react';
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
import styles from '@/components/profile/ratings/landscapeRatingTicker.module.css';
import { RatingLaneTabs } from '@/components/profile/ratings/RatingLaneTabs';
import { RatingTickerChart } from '@/components/profile/ratings/RatingTickerChart';
import { MultiLineRatingTickerChart } from '@/components/profile/ratings/MultiLineRatingTickerChart';
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
}: Props) {
  const def = timeControlByRatingTrackId(ratingTrackId);
  const isExact = Boolean(def?.badgeTrackKey);
  const showBadgeUnavailable = isExact && !isSelf;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lane, setLane] = useState<RatingLane>(DEFAULT_RATING_LANE);
  const [acclSupplementalOrder, setAcclSupplementalOrder] = useState<MajorFamilyTrackId[]>([]);
  const [nowMs] = useState(() => Date.now());
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
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

  return (
    <div data-testid="rating-track-detail-panel" className="space-y-3 rounded-xl border border-[#2f3f54] bg-[#0b121c] p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-semibold text-white">{trackLabel} ticker</h3>
        {canExpandLandscape ? (
          <button
            type="button"
            className={`${styles.expandAlways} shrink-0 rounded-md border border-[#3d5168] px-2 py-1 text-xs text-gray-300`}
            data-testid="rating-ticker-expand-mobile"
            onClick={() => setDrawerOpen(true)}
          >
            Expand
          </button>
        ) : null}
      </div>
      {!isSelf && isExact ? (
        <p className="m-0 text-xs text-gray-500">{RATING_EXACT_SELF_ONLY}</p>
      ) : null}

      {isAcclTicker ? (
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
      ) : null}
      {exactEmptyHistory ? (
        <p className="m-0 text-xs text-gray-500" data-testid="rating-exact-track-history-empty">
          {exactTrackHistoryEmptyLabel(trackLabel)}
        </p>
      ) : null}

      {!allEmpty ? (
        <RatingLaneTabs
          lane={lane}
          onLaneChange={setLane}
          testIdPrefix="rating"
          ariaLabel="Rating history window"
        />
      ) : null}

      {laneEmpty && !laneDrawable ? (
        <p className="m-0 text-xs text-gray-500" data-testid="rating-lane-empty">
          {RATING_LANE_EMPTY}
        </p>
      ) : (
        useAcclMultiLine ? (
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
        )
      )}

      {laneEmpty && laneDrawable ? (
        <p className="m-0 text-xs text-gray-500" data-testid="rating-lane-empty">
          {RATING_LANE_EMPTY}
        </p>
      ) : null}

      <BadgeBoundaryPanel badge={badge} showUnavailable={showBadgeUnavailable || (isSelf && isExact)} />
      <ExpandedRatingTickerDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        trackLabel={trackLabel}
        currentRating={currentRating}
        points={points}
        lane={lane}
        onLaneChange={setLane}
        canLinkFinishedGames={canLinkFinishedGames}
        historyByTrack={historyByTrack}
      />
    </div>
  );
}
