'use client';

import type { MajorFamilySeriesData } from '@/lib/profileRatingChartLevels';
import { MultiLineRatingTickerChart } from '@/components/profile/ratings/MultiLineRatingTickerChart';

type Props = {
  open: boolean;
  onClose: () => void;
  series: MajorFamilySeriesData[];
  visibleTrackIds: ReadonlySet<string>;
  canLinkFinishedGames: boolean;
};

export function ExpandedRatingComparisonDrawer({
  open,
  onClose,
  series,
  visibleTrackIds,
  canLinkFinishedGames,
}: Props) {
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
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <MultiLineRatingTickerChart
          series={series}
          visibleTrackIds={visibleTrackIds}
          canLinkFinishedGames={canLinkFinishedGames}
          expanded
        />
      </div>
    </div>
  );
}
