'use client';

import { useState } from 'react';
import type { PlayerBadgeStateRow } from '@/lib/badgeSettlement';
import { timeControlByRatingTrackId } from '@/lib/acclTimeControls';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';
import { BadgeBoundaryPanel } from '@/components/profile/ratings/BadgeBoundaryPanel';
import { ExpandedRatingTickerDrawer } from '@/components/profile/ratings/ExpandedRatingTickerDrawer';
import { RatingTickerChart } from '@/components/profile/ratings/RatingTickerChart';
import {
  exactTrackHistoryEmptyLabel,
  RATING_EXACT_SELF_ONLY,
} from '@/components/profile/ratings/ratingTickerEmptyStates';

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
  const [drawerOpen, setDrawerOpen] = useState(false);
  const exactEmptyHistory = isExact && isSelf && points.length === 0;

  return (
    <div data-testid="rating-track-detail-panel" className="space-y-3 rounded-xl border border-[#2f3f54] bg-[#0b121c] p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-semibold text-white">{trackLabel} ticker</h3>
        {points.length > 0 ? (
          <button
            type="button"
            className="shrink-0 rounded-md border border-[#3d5168] px-2 py-1 text-xs text-gray-300 sm:hidden"
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
      {exactEmptyHistory ? (
        <p className="m-0 text-xs text-gray-500" data-testid="rating-exact-track-history-empty">
          {exactTrackHistoryEmptyLabel(trackLabel)}
        </p>
      ) : null}
      <RatingTickerChart
        points={points}
        currentRating={currentRating}
        canLinkFinishedGames={canLinkFinishedGames}
      />
      <BadgeBoundaryPanel badge={badge} showUnavailable={showBadgeUnavailable || (isSelf && isExact)} />
      <ExpandedRatingTickerDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        trackLabel={trackLabel}
        currentRating={currentRating}
        points={points}
        canLinkFinishedGames={canLinkFinishedGames}
      />
    </div>
  );
}
