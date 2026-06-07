'use client';

import { useMemo } from 'react';
import { filterPointsByLane, type RatingLane } from '@/lib/ratingHistoryMetrics';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';
import { RatingLaneTabs } from '@/components/profile/ratings/RatingLaneTabs';
import { RatingTickerChart } from '@/components/profile/ratings/RatingTickerChart';
import { RATING_LANE_EMPTY } from '@/components/profile/ratings/ratingTickerEmptyStates';

type Props = {
  open: boolean;
  onClose: () => void;
  trackLabel: string;
  currentRating: number | null;
  /** Full authoritative ledger points for the track (unfiltered). */
  points: RatingHistoryPoint[];
  lane: RatingLane;
  onLaneChange: (lane: RatingLane) => void;
  canLinkFinishedGames: boolean;
};

export function ExpandedRatingTickerDrawer({
  open,
  onClose,
  trackLabel,
  currentRating,
  points,
  lane,
  onLaneChange,
  canLinkFinishedGames,
}: Props) {
  const lanePoints = useMemo(() => filterPointsByLane(points, lane), [points, lane]);
  const laneEmpty = points.length > 0 && lanePoints.length === 0;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[400] flex flex-col bg-[#070b10]/95 sm:hidden"
      data-testid="expanded-rating-ticker-drawer"
      role="dialog"
      aria-modal="true"
      aria-label={`${trackLabel} rating history`}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-[#2f3f54] px-4 py-3">
        <h3 className="m-0 text-sm font-semibold text-white">{trackLabel}</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-[#3d5168] px-3 py-1 text-sm text-gray-200"
          data-testid="expanded-ticker-close"
        >
          Close
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <RatingLaneTabs
          lane={lane}
          onLaneChange={onLaneChange}
          testIdPrefix="rating"
          ariaLabel="Rating history window"
        />
        {laneEmpty ? (
          <p className="m-0 text-xs text-gray-500" data-testid="rating-lane-empty">
            {RATING_LANE_EMPTY}
          </p>
        ) : (
          <RatingTickerChart
            points={lanePoints}
            currentRating={currentRating}
            canLinkFinishedGames={canLinkFinishedGames}
            expanded
          />
        )}
        {!laneEmpty ? (
          <ol className="mt-4 list-none space-y-2 p-0" data-testid="rating-ticker-point-list">
            {[...lanePoints]
              .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
              .map((p) => (
                <li
                  key={p.id}
                  className="rounded-lg border border-[#2f3f54] bg-[#0f1723] px-3 py-2 text-sm text-gray-200"
                >
                  <span className="tabular-nums">
                    {p.ratingBefore} → {p.ratingAfter} ({p.ratingDelta >= 0 ? '+' : ''}
                    {p.ratingDelta})
                  </span>
                  <span className="mt-1 block text-xs text-gray-400">
                    {new Date(p.occurredAt).toLocaleString()} · {p.result}
                  </span>
                </li>
              ))}
          </ol>
        ) : null}
      </div>
    </div>
  );
}
