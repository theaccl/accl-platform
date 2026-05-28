'use client';

import type { PlayerBadgeStateRow } from '@/lib/badgeSettlement';
import { timeControlByRatingTrackId } from '@/lib/acclTimeControls';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';
import { BadgeBoundaryPanel } from '@/components/profile/ratings/BadgeBoundaryPanel';
import { RatingTickerChart } from '@/components/profile/ratings/RatingTickerChart';
import { RATING_EXACT_SELF_ONLY } from '@/components/profile/ratings/ratingTickerEmptyStates';

type Props = {
  trackLabel: string;
  ratingTrackId: string;
  currentRating: number | null;
  points: RatingHistoryPoint[];
  badge: PlayerBadgeStateRow | null | undefined;
  isSelf: boolean;
  canLinkFinishedGames: boolean;
};

export function RatingTrackDetailPanel({
  trackLabel,
  ratingTrackId,
  currentRating,
  points,
  badge,
  isSelf,
  canLinkFinishedGames,
}: Props) {
  const def = timeControlByRatingTrackId(ratingTrackId);
  const isExact = Boolean(def?.badgeTrackKey);
  const showBadgeUnavailable = isExact && !isSelf;

  return (
    <div data-testid="rating-track-detail-panel" className="space-y-3 rounded-xl border border-[#2f3f54] bg-[#0b121c] p-4">
      <h3 className="m-0 text-sm font-semibold text-white">{trackLabel} ticker</h3>
      {!isSelf && isExact ? (
        <p className="m-0 text-xs text-gray-500">{RATING_EXACT_SELF_ONLY}</p>
      ) : null}
      <RatingTickerChart
        points={points}
        currentRating={currentRating}
        canLinkFinishedGames={canLinkFinishedGames}
      />
      <BadgeBoundaryPanel badge={badge} showUnavailable={showBadgeUnavailable || (isSelf && isExact)} />
    </div>
  );
}
