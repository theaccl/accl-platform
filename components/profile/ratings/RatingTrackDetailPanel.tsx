'use client';

import { useCallback, useMemo, useState } from 'react';
import type { PlayerBadgeStateRow } from '@/lib/badgeSettlement';
import { timeControlByRatingTrackId } from '@/lib/acclTimeControls';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';
import {
  DEFAULT_RATING_LANE,
  filterPointsByLane,
  type RatingLane,
} from '@/lib/ratingHistoryMetrics';
import { LANDSCAPE_TICKER_CATEGORIES } from '@/lib/profile/landscapeTickerCategories';
import { BadgeBoundaryPanel } from '@/components/profile/ratings/BadgeBoundaryPanel';
import { ExpandedRatingTickerDrawer } from '@/components/profile/ratings/ExpandedRatingTickerDrawer';
import styles from '@/components/profile/ratings/landscapeRatingTicker.module.css';
import { RatingLaneTabs } from '@/components/profile/ratings/RatingLaneTabs';
import { RatingTickerChart } from '@/components/profile/ratings/RatingTickerChart';
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
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const lanePoints = useMemo(() => filterPointsByLane(points, lane), [points, lane]);
  const allEmpty = points.length === 0;
  const laneEmpty = !allEmpty && lanePoints.length === 0;
  const exactEmptyHistory = isExact && isSelf && allEmpty;
  const canExpandLandscape =
    points.length > 0 ||
    LANDSCAPE_TICKER_CATEGORIES.some((cat) => (historyByTrack[cat.trackId]?.length ?? 0) > 0);

  return (
    <div data-testid="rating-track-detail-panel" className="space-y-3 rounded-xl border border-[#2f3f54] bg-[#0b121c] p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-semibold text-white">{trackLabel} ticker</h3>
        {canExpandLandscape ? (
          <button
            type="button"
            className={`${styles.expandMobile} shrink-0 rounded-md border border-[#3d5168] px-2 py-1 text-xs text-gray-300`}
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

      {!allEmpty ? (
        <RatingLaneTabs
          lane={lane}
          onLaneChange={setLane}
          testIdPrefix="rating"
          ariaLabel="Rating history window"
        />
      ) : null}

      {laneEmpty ? (
        <p className="m-0 text-xs text-gray-500" data-testid="rating-lane-empty">
          {RATING_LANE_EMPTY}
        </p>
      ) : (
        <RatingTickerChart
          points={lanePoints}
          currentRating={currentRating}
          canLinkFinishedGames={canLinkFinishedGames}
        />
      )}

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
