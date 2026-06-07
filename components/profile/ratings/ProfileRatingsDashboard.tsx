'use client';

import { useEffect, useMemo, useState } from 'react';
import type { RatingMode } from '@/lib/acclTimeControls';
import { visibleTimeControlsForMode } from '@/lib/acclTimeControls';
import { loadProfileRatingDashboardData } from '@/lib/loadProfileRatingDashboard';
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
  const hasHistory = historyPoints.length > 0;

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
    </section>
  );
}
