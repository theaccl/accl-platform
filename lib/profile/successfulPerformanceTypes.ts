/**
 * Successful Performance — typed authoritative contracts (frontend foundation).
 *
 * Locked metric (product-facing "Successful Performance"):
 *   successful points = wins + (draws * 0.5)
 *   Successful Performance percentage = successful points / eligible games * 100
 *
 * These types intentionally make the MISSING backend authority explicit. Every
 * aggregate carries a `sourceStatus`, so a consumer can never confuse "no
 * authoritative data" with "0%". There is deliberately NO adapter here from the
 * current capped Profile reads (games/ledger/p1 games_played); an authoritative
 * uncapped read must supply these values in a later, separate backend lane.
 */

export type RatingModeName = 'bullet' | 'blitz' | 'rapid' | 'daily';

/**
 * Identity scope of an aggregate.
 * - overall / mode / exact_control: threshold-gated batteries (see unlock resolver)
 * - battlefield / tournament: authorized no-threshold summaries
 */
export type SuccessfulPerformanceScope =
  | 'overall'
  | 'mode'
  | 'battlefield'
  | 'tournament'
  | 'exact_control';

/** Chess seat. White and Black are always kept separate for battery unlocks. */
export type PlayerColor = 'white' | 'black' | 'combined';

/** Whether the authoritative backend read actually produced this aggregate. */
export type AuthoritativeSourceStatus = 'available' | 'unavailable';

/**
 * Authoritative aggregate input. Must originate from a complete, uncapped
 * authoritative read — never from capped browser history or client inference.
 */
export type SuccessfulPerformanceAggregate = {
  scope: SuccessfulPerformanceScope;
  mode?: RatingModeName | null;
  color: PlayerColor;
  exactControl?: string | null;
  wins: number;
  draws: number;
  losses: number;
  /**
   * The one authoritative count for this exact aggregate identity (scope + color
   * [+ mode/exactControl]). It is BOTH:
   *  - the percentage denominator: eligibleGames === wins + draws + losses, and
   *  - the authoritative sample count that drives threshold unlock gating
   *    (10 exact-control, 100 broad-mode Route A).
   * There is deliberately no separate unlock/sample count: a single population of
   * eligible completed games cannot diverge from itself, so an "unlocked with zero
   * games" state is impossible by construction.
   */
  eligibleGames: number;
  sourceStatus: AuthoritativeSourceStatus;
};

/** Result of the pure scoring helper. Never returns a fabricated 0%. */
export type SuccessfulPerformanceScore =
  | { status: 'ok'; successfulPoints: number; percentage: number; eligibleGames: number }
  | { status: 'insufficient_data' }
  | { status: 'unavailable' }
  | { status: 'invalid'; reason: string };

/** Resolved battery / summary state for presentation. */
export type SuccessfulPerformanceState =
  | 'locked'
  | 'progress'
  | 'unlocked'
  | 'insufficient_data'
  | 'unavailable'
  | 'invalid';

/**
 * Per-exact-control unlock fact for one mode + color. Used only as Route B input
 * to broad-mode unlock. One exact control can never unlock another, and a
 * descriptor for a different mode or color is ignored by the resolver.
 */
export type ExactControlUnlockDescriptor = {
  mode: RatingModeName;
  color: PlayerColor;
  exactControl: string;
  unlocked: boolean;
};

/**
 * Fully resolved view model consumed by the presentational card. The card
 * performs NO calculation and NO data access — it renders this model verbatim.
 */
export type SuccessfulPerformanceView = {
  scope: SuccessfulPerformanceScope;
  mode: RatingModeName | null;
  color: PlayerColor;
  exactControl: string | null;
  state: SuccessfulPerformanceState;
  /** Unlock threshold for threshold-gated scopes; null for no-threshold scopes. */
  threshold: number | null;
  /** Authoritative count toward the threshold; null for no-threshold scopes. */
  progressCount: number | null;
  /** Only populated when state is 'unlocked' and scoring is valid; else null. */
  percentage: number | null;
  successfulPoints: number | null;
  eligibleGames: number | null;
  invalidReason: string | null;
};
