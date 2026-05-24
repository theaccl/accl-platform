export type RatingMode =
  | 'accl'
  | 'tournament'
  | 'bullet'
  | 'blitz'
  | 'rapid'
  | 'daily';

export type RatingGameResult = 'win' | 'loss' | 'draw';

export type RatingGameSource = 'free' | 'tournament';

export type RatingGameColor = 'white' | 'black';

/**
 * One finished rated game that moved the player's rating in a bucket.
 * Every chart point must map 1:1 to a snapshot when history is shown.
 * @see docs/profile/PROFILE_RATING_DASHBOARD_DOCTRINE.md
 */
export type RatingGamePointSnapshot = {
  gameId: string;
  finishedAt: string;
  ratingBucket: string;
  mode: RatingMode;
  timeControl: string | null;
  opponentUsername: string | null;
  opponentRating: number | null;
  result: RatingGameResult;
  ratingBefore: number;
  ratingAfter: number;
  ratingDelta: number;
  colorPlayed?: RatingGameColor | null;
  /** ECO / opening label — optional until opening metadata is wired */
  openingEco?: string | null;
  source?: RatingGameSource | null;
};

/** Authoritative game-by-game series for a bucket chart / expanded ticker. */
export type RatingHistorySeries = {
  bucketId: string;
  points: RatingGamePointSnapshot[];
};

/**
 * @deprecated Prefer RatingGamePointSnapshot. Legacy chart shape kept for gradual migration.
 * New code should use finishedAt + ratingAfter from snapshots.
 */
export type RatingPoint = {
  date: string;
  rating: number;
  gameId?: string;
  result?: RatingGameResult;
  opponentRating?: number | null;
  ratingDelta?: number | null;
};

export type RatingBucketView = {
  id: string;
  label: string;
  mode: RatingMode;
  timeControl?: string;
  isOverall: boolean;
  currentRating: number | null;
  delta?: number | null;
  peak?: number | null;
  lowest?: number | null;
  gamesPlayed?: number | null;
  wins?: number | null;
  losses?: number | null;
  draws?: number | null;
  winRate?: number | null;
  bestStreak?: string | null;
  currentStreak?: string | null;
  last10Change?: number | null;
  last30DaysChange?: number | null;
  averageOpponent?: number | null;
  sparkline?: RatingGamePointSnapshot[];
  /** Game-by-game rating snapshots — never fabricated; see rating history doctrine. */
  history?: RatingGamePointSnapshot[];
  /** When true, numeric stats come from the parent mode bucket only. */
  inheritsModeBucket?: boolean;
};

/** Filters for expanded rating ticker (mobile / dedicated page). */
export type RatingTickerFilters = {
  period: RatingPeriodFilter;
  gameFilter: RatingGameFilter;
  dateFrom?: string | null;
  dateTo?: string | null;
};

/** View model for a dedicated per-bucket rating ticker page. */
export type RatingTickerExpandedModel = {
  profileId: string;
  bucket: RatingBucketView;
  series: RatingHistorySeries | null;
  selectedGameId: string | null;
  filters: RatingTickerFilters;
};

export type ProfileRatingDashboardModel = {
  topCards: RatingBucketView[];
  bucketsByMode: Record<RatingMode, RatingBucketView[]>;
};

export type RatingPeriodFilter = '7d' | '30d' | '90d' | '1y' | 'all';

export type RatingGameFilter =
  | 'all'
  | 'wins'
  | 'losses'
  | 'draws'
  | 'free'
  | 'tournament';
