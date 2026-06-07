'use client';

import { useMemo, useState } from 'react';
import {
  MAJOR_FAMILY_COMPARISON_SERIES,
  buildMajorFamilySeriesData,
  type MajorFamilyTrackId,
} from '@/lib/profileRatingChartLevels';
import {
  filterMajorFamilySeriesByLane,
  majorFamilySeriesHasAnyPoints,
} from '@/lib/profileRatingFamilyComparison';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';
import { DEFAULT_RATING_LANE, type RatingLane } from '@/lib/ratingHistoryMetrics';
import { ExpandedRatingComparisonDrawer } from '@/components/profile/ratings/ExpandedRatingComparisonDrawer';
import { RatingLaneTabs } from '@/components/profile/ratings/RatingLaneTabs';
import { MultiLineRatingTickerChart } from '@/components/profile/ratings/MultiLineRatingTickerChart';
import { RATING_LANE_EMPTY } from '@/components/profile/ratings/ratingTickerEmptyStates';

const COMPARISON_EMPTY =
  'Major-family comparison will appear here after finished rated games are recorded for these tracks.';

type Props = {
  historyByTrack: Record<string, RatingHistoryPoint[]>;
  canLinkFinishedGames: boolean;
};

function initialVisibleSet(): Set<MajorFamilyTrackId> {
  return new Set(MAJOR_FAMILY_COMPARISON_SERIES.map((s) => s.trackId));
}

export function RatingFamilyComparisonPanel({ historyByTrack, canLinkFinishedGames }: Props) {
  const [lane, setLane] = useState<RatingLane>(DEFAULT_RATING_LANE);
  const [hidden, setHidden] = useState<Set<MajorFamilyTrackId>>(new Set());
  const [drawerOpen, setDrawerOpen] = useState(false);

  const baseSeries = useMemo(() => buildMajorFamilySeriesData(historyByTrack), [historyByTrack]);
  const laneSeries = useMemo(() => filterMajorFamilySeriesByLane(baseSeries, lane), [baseSeries, lane]);
  const visibleTrackIds = useMemo(() => {
    const vis = initialVisibleSet();
    for (const id of hidden) vis.delete(id);
    return vis;
  }, [hidden]);

  const anyLanePoints = majorFamilySeriesHasAnyPoints(laneSeries);
  const anyBasePoints = majorFamilySeriesHasAnyPoints(baseSeries);
  const renderedPointCount = useMemo(
    () =>
      laneSeries
        .filter((s) => visibleTrackIds.has(s.trackId))
        .reduce((n, s) => n + s.points.length, 0),
    [laneSeries, visibleTrackIds],
  );

  function toggleTrack(trackId: MajorFamilyTrackId) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  }

  return (
    <div
      data-testid="rating-family-comparison-panel"
      className="space-y-3 rounded-xl border border-[#2f3f54] bg-[#0b121c] p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-semibold text-white">Compare major ratings</h3>
        {anyLanePoints && renderedPointCount > 0 ? (
          <button
            type="button"
            className="shrink-0 rounded-md border border-[#3d5168] px-2 py-1 text-xs text-gray-300 sm:hidden"
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
      ) : !anyLanePoints ? (
        <p className="m-0 text-xs text-gray-500" data-testid="comparison-lane-empty">
          {RATING_LANE_EMPTY}
        </p>
      ) : renderedPointCount === 0 ? (
        <p className="m-0 text-xs text-gray-500" data-testid="comparison-all-hidden">
          Show at least one family in the legend to draw the chart.
        </p>
      ) : (
        <MultiLineRatingTickerChart
          series={laneSeries}
          visibleTrackIds={visibleTrackIds}
          canLinkFinishedGames={canLinkFinishedGames}
        />
      )}

      <ExpandedRatingComparisonDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        baseSeries={baseSeries}
        lane={lane}
        onLaneChange={setLane}
        visibleTrackIds={visibleTrackIds}
        canLinkFinishedGames={canLinkFinishedGames}
      />
    </div>
  );
}
