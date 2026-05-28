'use client';

import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';
import { RatingTickerChart } from '@/components/profile/ratings/RatingTickerChart';

type Props = {
  open: boolean;
  onClose: () => void;
  trackLabel: string;
  currentRating: number | null;
  points: RatingHistoryPoint[];
  canLinkFinishedGames: boolean;
};

export function ExpandedRatingTickerDrawer({
  open,
  onClose,
  trackLabel,
  currentRating,
  points,
  canLinkFinishedGames,
}: Props) {
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
        >
          Close
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <RatingTickerChart
          points={points}
          currentRating={currentRating}
          canLinkFinishedGames={canLinkFinishedGames}
          expanded
        />
        <ol className="mt-4 list-none space-y-2 p-0" data-testid="rating-ticker-point-list">
          {[...points]
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
      </div>
    </div>
  );
}
