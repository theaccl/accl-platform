'use client';

import { useMemo } from 'react';
import type { MajorFamilySeriesData } from '@/lib/profileRatingChartLevels';
import { filterMajorFamilySeriesByLane, majorFamilySeriesHasAnyPoints } from '@/lib/profileRatingFamilyComparison';
import type { RatingLane } from '@/lib/ratingHistoryMetrics';
import { MultiLineRatingTickerChart } from '@/components/profile/ratings/MultiLineRatingTickerChart';
import { RatingLaneTabs } from '@/components/profile/ratings/RatingLaneTabs';
import { RATING_LANE_EMPTY } from '@/components/profile/ratings/ratingTickerEmptyStates';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Full major-family series before lane filtering. */
  baseSeries: MajorFamilySeriesData[];
  lane: RatingLane;
  onLaneChange: (lane: RatingLane) => void;
  visibleTrackIds: ReadonlySet<string>;
  canLinkFinishedGames: boolean;
};

export function ExpandedRatingComparisonDrawer({
  open,
  onClose,
  baseSeries,
  lane,
  onLaneChange,
  visibleTrackIds,
  canLinkFinishedGames,
}: Props) {
  const laneSeries = useMemo(() => filterMajorFamilySeriesByLane(baseSeries, lane), [baseSeries, lane]);
  const anyLanePoints = majorFamilySeriesHasAnyPoints(laneSeries);
  const renderedPointCount = useMemo(
    () =>
      laneSeries
        .filter((s) => visibleTrackIds.has(s.trackId))
        .reduce((n, s) => n + s.points.length, 0),
    [laneSeries, visibleTrackIds],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[400] flex flex-col bg-[#070b10]/95 sm:hidden"
      data-testid="expanded-rating-comparison-drawer"
      role="dialog"
      aria-modal="true"
      aria-label="Compare major ratings"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-[#2f3f54] px-4 py-3">
        <h3 className="m-0 text-sm font-semibold text-white">Compare major ratings</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-[#3d5168] px-3 py-1 text-sm text-gray-200"
          data-testid="expanded-comparison-close"
        >
          Close
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <RatingLaneTabs
          lane={lane}
          onLaneChange={onLaneChange}
          testIdPrefix="comparison"
          ariaLabel="Comparison history window"
        />
        {!anyLanePoints ? (
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
            expanded
          />
        )}
      </div>
    </div>
  );
}
