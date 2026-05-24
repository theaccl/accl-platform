export type RatingMode =
  | 'accl'
  | 'tournament'
  | 'bullet'
  | 'blitz'
  | 'rapid'
  | 'daily';

export type RatingPoint = {
  date: string;
  rating: number;
  gameId?: string;
  result?: 'win' | 'loss' | 'draw';
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
  sparkline?: RatingPoint[];
  history?: RatingPoint[];
  /** When true, numeric stats come from the parent mode bucket only. */
  inheritsModeBucket?: boolean;
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
