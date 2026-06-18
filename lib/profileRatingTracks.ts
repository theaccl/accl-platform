import {
  modeOverallRatingTrackId,
  type RatingMode,
  visibleTimeControlsForMode,
} from '@/lib/acclTimeControls';
import type { PublicP1Read } from '@/lib/p1PublicRatingRead';
import { formatRatingDisplay } from '@/lib/p1PublicRatingRead';
import type { ProfileTopLevelTrackId } from '@/lib/ratingHistoryTypes';

export type TopLevelRatingCardModel = {
  id: ProfileTopLevelTrackId;
  label: string;
  rating: number | null;
  gamesPlayed: number | null;
  testId?: string;
  mode?: RatingMode;
};

export function topLevelRatingCardsFromP1(p1: PublicP1Read | null | undefined): TopLevelRatingCardModel[] {
  return [
    {
      id: 'accl',
      label: 'ACCL Rating',
      rating: p1?.accl_rating ?? p1?.accl_overall?.rating ?? null,
      gamesPlayed: p1?.accl_overall?.games_played ?? null,
      testId: 'profile-elo-accl',
    },
    {
      id: 'tournament',
      label: 'Tournament Rating',
      rating: p1?.tournament_unified?.rating ?? p1?.tournament_rating ?? null,
      gamesPlayed: p1?.tournament_unified?.games_played ?? null,
      testId: 'profile-elo-tournament',
    },
    {
      id: 'free_bullet',
      label: 'Bullet',
      rating: p1?.free_bullet?.rating ?? null,
      gamesPlayed: p1?.free_bullet?.games_played ?? null,
      testId: 'profile-elo-bullet',
      mode: 'bullet',
    },
    {
      id: 'free_blitz',
      label: 'Blitz',
      rating: p1?.free_blitz?.rating ?? null,
      gamesPlayed: p1?.free_blitz?.games_played ?? null,
      mode: 'blitz',
    },
    {
      id: 'free_rapid',
      label: 'Rapid',
      rating: p1?.free_rapid?.rating ?? null,
      gamesPlayed: p1?.free_rapid?.games_played ?? null,
      mode: 'rapid',
    },
    {
      id: 'free_day',
      label: 'Daily',
      rating: p1?.free_day?.rating ?? null,
      gamesPlayed: p1?.free_day?.games_played ?? null,
      mode: 'daily',
    },
  ];
}

export type SubtrackCardModel = {
  ratingTrackId: string;
  label: string;
  displayLabel: string;
  rating: number | null;
  gamesPlayed: number | null;
  isOverall?: boolean;
};

export function subtracksForMode(
  mode: RatingMode,
  modeRating: number | null,
  modeGames: number | null,
  exactRatings: Map<string, number> | undefined,
  gamesCountByTrack?: Record<string, number>,
): SubtrackCardModel[] {
  const overallId = modeOverallRatingTrackId(mode);
  const modeLabel = mode.charAt(0).toUpperCase() + mode.slice(1);
  const overallCount = gamesCountByTrack?.[overallId];
  const rows: SubtrackCardModel[] = [
    {
      ratingTrackId: overallId,
      label: `${modeLabel} overall`,
      displayLabel: `${modeLabel} Overall`,
      rating: modeRating,
      gamesPlayed: overallCount !== undefined ? overallCount : modeGames,
      isOverall: true,
    },
  ];

  for (const tc of visibleTimeControlsForMode(mode)) {
    const exactCount = gamesCountByTrack?.[tc.ratingTrackId];
    rows.push({
      ratingTrackId: tc.ratingTrackId,
      label: tc.label,
      displayLabel: tc.displayLabel,
      rating: exactRatings?.get(tc.ratingTrackId) ?? null,
      gamesPlayed: exactCount !== undefined ? exactCount : null,
    });
  }

  return rows;
}

export function formatTrackRating(n: number | null | undefined): string {
  return formatRatingDisplay(n);
}
