import type { PublicP1Read } from '@/lib/p1PublicRatingRead';
import { acclRatingFromP1 } from '@/lib/p1PublicRatingRead';
import type {
  ProfileRatingDashboardModel,
  RatingBucketView,
  RatingMode,
} from '@/lib/profile/ratingDashboardTypes';
import { RATING_TIME_CONTROLS } from '@/lib/profile/ratingTimeControlCatalog';

type ProfileStreakContext = {
  currentStreak?: number;
  highestStreak?: number;
};

function row(
  id: string,
  label: string,
  mode: RatingMode,
  currentRating: number | null,
  gamesPlayed: number | null,
  opts?: {
    timeControl?: string;
    isOverall?: boolean;
    inheritsModeBucket?: boolean;
    streak?: ProfileStreakContext;
  },
): RatingBucketView {
  const isOverall = opts?.isOverall ?? false;
  return {
    id,
    label,
    mode,
    timeControl: opts?.timeControl,
    isOverall,
    currentRating,
    delta: null,
    peak: null,
    lowest: null,
    gamesPlayed,
    wins: null,
    losses: null,
    draws: null,
    winRate: null,
    bestStreak:
      typeof opts?.streak?.highestStreak === 'number' && opts.streak.highestStreak > 0
        ? `${opts.streak.highestStreak} wins`
        : null,
    currentStreak:
      typeof opts?.streak?.currentStreak === 'number' && opts.streak.currentStreak > 0
        ? `${opts.streak.currentStreak} wins`
        : opts?.streak?.currentStreak === 0
          ? 'None'
          : null,
    last10Change: null,
    last30DaysChange: null,
    averageOpponent: null,
    sparkline: undefined,
    history: undefined,
    inheritsModeBucket: opts?.inheritsModeBucket,
  };
}

function modeBucket(
  mode: RatingMode,
  rating: number | null,
  gamesPlayed: number | null,
  streak?: ProfileStreakContext,
): RatingBucketView {
  const defs = mode === 'accl' ? [] : RATING_TIME_CONTROLS[mode];
  const overallDef = defs.find((d) => d.timeControl === 'overall') ?? defs[0];
  const id = mode === 'accl' ? 'accl-overall' : (overallDef?.id ?? `${mode}-overall`);
  const label = mode === 'accl' ? 'ACCL Rating' : (overallDef?.label ?? `${mode} Overall`);

  return row(id, label, mode, rating, gamesPlayed, {
    timeControl: 'overall',
    isOverall: true,
    streak,
  });
}

function childBuckets(
  mode: Exclude<RatingMode, 'accl'>,
  parentRating: number | null,
  parentGames: number | null,
): RatingBucketView[] {
  return RATING_TIME_CONTROLS[mode].map((def) =>
    row(def.id, def.label, mode, def.timeControl === 'overall' ? parentRating : null, def.timeControl === 'overall' ? parentGames : null, {
      timeControl: def.timeControl,
      isOverall: def.timeControl === 'overall',
      inheritsModeBucket: def.timeControl !== 'overall',
    }),
  );
}

/**
 * Read-only adapter: current P1 snapshot only. Rating history and per-TC splits are not fabricated.
 * Game-by-game chart points come from a future rating-history API as RatingGamePointSnapshot rows.
 * @see docs/profile/PROFILE_RATING_DASHBOARD_DOCTRINE.md
 */
export function buildProfileRatingViewModel(
  p1: PublicP1Read | null | undefined,
  streak?: ProfileStreakContext,
): ProfileRatingDashboardModel {
  const accl = acclRatingFromP1(p1, null);
  const tournamentRating = p1?.tournament_unified?.rating ?? p1?.tournament_rating ?? null;
  const tournamentGames = p1?.tournament_unified?.games_played ?? null;

  const bulletRating = p1?.free_bullet?.rating ?? null;
  const bulletGames = p1?.free_bullet?.games_played ?? null;
  const blitzRating = p1?.free_blitz?.rating ?? null;
  const blitzGames = p1?.free_blitz?.games_played ?? null;
  const rapidRating = p1?.free_rapid?.rating ?? null;
  const rapidGames = p1?.free_rapid?.games_played ?? null;
  const dailyRating = p1?.free_day?.rating ?? null;
  const dailyGames = p1?.free_day?.games_played ?? null;

  const topCards: RatingBucketView[] = [
    modeBucket('accl', accl, p1?.tournament_unified?.games_played ?? tournamentGames, streak),
    modeBucket('tournament', tournamentRating, tournamentGames, streak),
    modeBucket('bullet', bulletRating, bulletGames, streak),
    modeBucket('blitz', blitzRating, blitzGames, streak),
    modeBucket('rapid', rapidRating, rapidGames, streak),
    modeBucket('daily', dailyRating, dailyGames, streak),
  ];

  return {
    topCards,
    bucketsByMode: {
      accl: [topCards[0]!],
      tournament: childBuckets('tournament', tournamentRating, tournamentGames),
      bullet: childBuckets('bullet', bulletRating, bulletGames),
      blitz: childBuckets('blitz', blitzRating, blitzGames),
      rapid: childBuckets('rapid', rapidRating, rapidGames),
      daily: childBuckets('daily', dailyRating, dailyGames),
    },
  };
}

export function findBucketById(
  model: ProfileRatingDashboardModel,
  bucketId: string,
): RatingBucketView | null {
  for (const card of model.topCards) {
    if (card.id === bucketId) return card;
  }
  for (const list of Object.values(model.bucketsByMode)) {
    const hit = list.find((b) => b.id === bucketId);
    if (hit) return hit;
  }
  return null;
}

export function defaultBucketIdForMode(mode: RatingMode, model: ProfileRatingDashboardModel): string {
  if (mode === 'accl') return model.topCards[0]?.id ?? 'accl-overall';
  const overall = model.bucketsByMode[mode].find((b) => b.isOverall);
  return overall?.id ?? model.bucketsByMode[mode][0]?.id ?? `${mode}-overall`;
}
