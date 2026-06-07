'use client';

import {
  RATING_LANES,
  RATING_LANE_LABELS,
  type RatingLane,
} from '@/lib/ratingHistoryMetrics';

type Props = {
  lane: RatingLane;
  onLaneChange: (lane: RatingLane) => void;
  /** `rating` → rating-lane-tab-* ; `comparison` → comparison-lane-tab-* */
  testIdPrefix: 'rating' | 'comparison';
  ariaLabel: string;
};

export function RatingLaneTabs({ lane, onLaneChange, testIdPrefix, ariaLabel }: Props) {
  const tablistId = testIdPrefix === 'comparison' ? 'comparison-lane-tabs' : 'rating-lane-tabs';

  return (
    <div
      className="flex gap-1 overflow-x-auto rounded-lg border border-[#23303f] bg-[#0c121c] p-1"
      data-testid={tablistId}
      role="tablist"
      aria-label={ariaLabel}
    >
      {RATING_LANES.map((l) => {
        const sel = l === lane;
        return (
          <button
            key={l}
            type="button"
            role="tab"
            aria-selected={sel}
            data-testid={`${testIdPrefix === 'comparison' ? 'comparison' : 'rating'}-lane-tab-${l}`}
            data-selected={sel ? 'true' : 'false'}
            onClick={() => onLaneChange(l)}
            className={`shrink-0 whitespace-nowrap rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              sel ? 'bg-sky-950/40 text-sky-300' : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {RATING_LANE_LABELS[l]}
          </button>
        );
      })}
    </div>
  );
}
