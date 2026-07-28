'use client';

import { useEffect, useMemo, useState } from 'react';
import type { RatingMode } from '@/lib/acclTimeControls';
import { visibleTimeControlsForMode } from '@/lib/acclTimeControls';
import { acclOverallRankLabelForLane } from '@/lib/profile/acclOverallRank';
import { loadProfileRatingDashboardData } from '@/lib/loadProfileRatingDashboard';
import {
  broadModeUnlockPolicyForMode,
  loadOwnSuccessfulPerformance,
  type OwnSuccessfulPerformanceResult,
} from '@/lib/profile/loadOwnSuccessfulPerformance';
import { resolveSuccessfulPerformanceView } from '@/lib/profile/successfulPerformanceUnlock';
import {
  subtracksForMode,
  topLevelRatingCardsFromP1,
  type TopLevelRatingCardModel,
} from '@/lib/profileRatingTracks';
import type { PublicP1Read } from '@/lib/p1PublicRatingRead';
import type { ProfileTopLevelTrackId } from '@/lib/ratingHistoryTypes';
import { supabase } from '@/lib/supabaseClient';
import { RatingCard } from '@/components/profile/ratings/RatingCard';
import { RatingSubtrackGrid } from '@/components/profile/ratings/RatingSubtrackGrid';
import { RatingFamilyComparisonPanel } from '@/components/profile/ratings/RatingFamilyComparisonPanel';
import { RatingTrackDetailPanel } from '@/components/profile/ratings/RatingTrackDetailPanel';
import { SuccessfulPerformanceCard } from '@/components/profile/ratings/SuccessfulPerformanceCard';

type Props = {
  p1: PublicP1Read | null | undefined;
  profileUserId: string;
  isSelf: boolean;
};

function allTrackIdsForLoad(): string[] {
  const modes: RatingMode[] = ['bullet', 'blitz', 'rapid', 'daily'];
  const ids = new Set<string>(['accl', 'tournament', 'free_bullet', 'free_blitz', 'free_rapid', 'free_day']);
  for (const mode of modes) {
    for (const tc of visibleTimeControlsForMode(mode)) {
      ids.add(tc.ratingTrackId);
    }
  }
  return [...ids];
}

function defaultDetailTrack(card: TopLevelRatingCardModel): string {
  return card.id;
}

export function ProfileRatingsDashboard({ p1, profileUserId, isSelf }: Props) {
  const cards = useMemo(() => topLevelRatingCardsFromP1(p1), [p1]);
  const [selectedTop, setSelectedTop] = useState<ProfileTopLevelTrackId>('accl');
  const [selectedDetail, setSelectedDetail] = useState<string>('accl');
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof loadProfileRatingDashboardData>>>({
    historyByTrack: {},
    badgeByTrack: {},
    gamesCountByTrack: {},
  });
  const [successfulPerformance, setSuccessfulPerformance] =
    useState<OwnSuccessfulPerformanceResult | null>(null);
  const [successfulPerformanceLoading, setSuccessfulPerformanceLoading] = useState(false);

  useEffect(() => {
    if (!isSelf) {
      setSuccessfulPerformance(null);
      setSuccessfulPerformanceLoading(false);
      return;
    }

    let cancelled = false;
    setSuccessfulPerformanceLoading(true);
    setSuccessfulPerformance(null);

    void loadOwnSuccessfulPerformance(supabase).then((result) => {
      if (cancelled) return;
      setSuccessfulPerformance(result);
      setSuccessfulPerformanceLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [isSelf]);

  useEffect(() => {
    if (!profileUserId) return;
    let cancelled = false;
    void loadProfileRatingDashboardData(supabase, profileUserId, isSelf, allTrackIdsForLoad()).then(
      (data) => {
        if (!cancelled) setDashboard(data);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [profileUserId, isSelf]);

  const activeCard = cards.find((c) => c.id === selectedTop) ?? cards[0];
  const mode = activeCard?.mode;

  const exactRatings = useMemo(() => {
    const m = new Map<string, number>();
    for (const [trackId, row] of Object.entries(dashboard.badgeByTrack)) {
      if (row && typeof row.settlement_rating === 'number') {
        m.set(trackId, row.settlement_rating);
      }
    }
    return m;
  }, [dashboard.badgeByTrack]);

  const subtracks = useMemo(() => {
    if (!mode || !activeCard) return null;
    return subtracksForMode(
      mode,
      activeCard.rating,
      activeCard.gamesPlayed,
      isSelf ? exactRatings : undefined,
      isSelf ? dashboard.gamesCountByTrack : undefined,
    );
  }, [mode, activeCard, exactRatings, isSelf, dashboard.gamesCountByTrack]);

  const detailRating = useMemo(() => {
    if (subtracks) {
      const row = subtracks.find((s) => s.ratingTrackId === selectedDetail);
      if (row) return row.rating;
    }
    if (selectedDetail === 'accl') return activeCard?.rating ?? null;
    if (selectedDetail === 'tournament') return activeCard?.rating ?? null;
    return activeCard?.rating ?? null;
  }, [subtracks, selectedDetail, activeCard]);

  const detailLabel = useMemo(() => {
    if (subtracks) {
      return subtracks.find((s) => s.ratingTrackId === selectedDetail)?.displayLabel ?? activeCard?.label ?? 'Track';
    }
    return activeCard?.label ?? 'Track';
  }, [subtracks, selectedDetail, activeCard]);

  const historyPoints = dashboard.historyByTrack[selectedDetail] ?? [];

  const selectedMode = activeCard?.mode ?? null;

  const broadModeSuccessfulPerformanceViews = useMemo(() => {
    if (!selectedMode || successfulPerformance?.status !== 'loaded') {
      return null;
    }
    const data = successfulPerformance;
    const policy = broadModeUnlockPolicyForMode(
      selectedMode,
      data.exactControlUnlocksByMode[selectedMode],
    );
    const aggregates = data.broadModeAggregates[selectedMode];
    return {
      white: resolveSuccessfulPerformanceView(aggregates.white, policy),
      black: resolveSuccessfulPerformanceView(aggregates.black, policy),
    };
  }, [selectedMode, successfulPerformance]);

  const battlefieldSuccessfulPerformanceView = useMemo(() => {
    if (successfulPerformance?.status !== 'loaded') return null;
    return resolveSuccessfulPerformanceView(successfulPerformance.battlefieldLifetime, {
      kind: 'no_threshold',
    });
  }, [successfulPerformance]);

  function selectTop(card: TopLevelRatingCardModel) {
    setSelectedTop(card.id);
    if (card.mode) {
      setSelectedDetail(defaultDetailTrack(card));
    } else {
      setSelectedDetail(card.id);
    }
  }

  return (
    <section
      className="space-y-4"
      aria-labelledby="profile-ratings-heading"
      data-testid="profile-rating-dashboard"
    >
      <h2 id="profile-ratings-heading" className="text-sm font-semibold text-white">
        Ratings
      </h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <RatingCard
            key={card.id}
            label={card.label}
            rating={card.rating}
            gamesPlayed={card.gamesPlayed}
            rankLabel={acclOverallRankLabelForLane(card.id, card.rating)}
            selected={selectedTop === card.id}
            hasHistory={
              (dashboard.historyByTrack[card.id]?.length ?? 0) > 0 ||
              (card.mode
                ? visibleTimeControlsForMode(card.mode).some(
                    (tc) => (dashboard.historyByTrack[tc.ratingTrackId]?.length ?? 0) > 0,
                  )
                : false)
            }
            testId={card.testId}
            onSelect={() => selectTop(card)}
          />
        ))}
      </div>

      {subtracks ? (
        <RatingSubtrackGrid
          subtracks={subtracks}
          selectedTrackId={selectedDetail}
          onSelect={setSelectedDetail}
        />
      ) : null}

      <RatingTrackDetailPanel
        trackLabel={detailLabel}
        ratingTrackId={selectedDetail}
        currentRating={detailRating}
        points={historyPoints}
        badge={dashboard.badgeByTrack[selectedDetail]}
        isSelf={isSelf}
        canLinkFinishedGames={isSelf}
      />

      {isSelf ? (
        <RatingFamilyComparisonPanel
          historyByTrack={dashboard.historyByTrack}
          canLinkFinishedGames
        />
      ) : null}

      {isSelf ? (
        <section
          className="space-y-3"
          aria-labelledby="profile-successful-performance-heading"
          data-testid="profile-successful-performance"
        >
          <h2
            id="profile-successful-performance-heading"
            className="text-sm font-semibold text-white"
          >
            Successful Performance
          </h2>

          {successfulPerformanceLoading ? (
            <p className="m-0 text-xs text-gray-500" data-testid="sp-loading">
              Loading Successful Performance…
            </p>
          ) : null}

          {!successfulPerformanceLoading && successfulPerformance?.status === 'unavailable' ? (
            <p className="m-0 text-xs text-gray-500" data-testid="sp-unavailable">
              Successful Performance is not available right now.
            </p>
          ) : null}

          {!successfulPerformanceLoading && successfulPerformance?.status === 'invalid' ? (
            <p className="m-0 text-xs text-amber-300/90" data-testid="sp-invalid">
              Successful Performance data could not be verified.
            </p>
          ) : null}

          {!successfulPerformanceLoading &&
          successfulPerformance?.status === 'loaded' &&
          broadModeSuccessfulPerformanceViews ? (
            <div
              className="grid gap-2 sm:grid-cols-2"
              data-testid="profile-successful-performance-broad-mode"
            >
              <SuccessfulPerformanceCard view={broadModeSuccessfulPerformanceViews.white} />
              <SuccessfulPerformanceCard view={broadModeSuccessfulPerformanceViews.black} />
            </div>
          ) : null}

          {!successfulPerformanceLoading &&
          successfulPerformance?.status === 'loaded' &&
          battlefieldSuccessfulPerformanceView ? (
            <div data-testid="profile-successful-performance-battlefield">
              <SuccessfulPerformanceCard view={battlefieldSuccessfulPerformanceView} />
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
