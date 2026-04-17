/** Phase 1–2.5 NEXUS command-center payload types (distinct from legacy `NexusData` in getNexusData.ts). */

export type PlaceholderState = {
  state: "placeholder";
  message: string;
};

export type ReadyState<T> = {
  state: "ready";
  items: T[];
};

export type NexusIdentitySummaryData = {
  displayName: string;
  elo: string;
  rank: string;
  gamesPlayed: string;
  wins: string;
  streak: string;
  /** True when user session missing or identity fields empty */
  isAnonymous: boolean;
};

export type NexusTournamentRow = {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
  href: string;
  /** Present only when sourced from DB (e.g. sponsor_label) — never invented. */
  tierLabel?: string;
  /** Derived label from status only (no guessed round numbers). */
  stageLabel?: string;
  /** User has a tournament_entries row for this tournament. */
  userParticipating?: boolean;
  /** User appears in a live game tied to this tournament. */
  userHasActiveGame?: boolean;
  /** Deterministic relevance score (mapping layer). */
  relevance?: number;
};

export type NexusTournamentSnapshotState =
  | PlaceholderState
  | ReadyState<NexusTournamentRow>;

export type NexusRecentResultRow = {
  id: string;
  playerLabel: string;
  eventLabel: string;
  result: string;
  utc: string;
  /** True when tier string from feed matches Elite / A (display-only). */
  tierHighlight?: boolean;
  /** Relative time label (e.g. "3 days ago"). */
  relativeLabel?: string;
};

export type NexusRecentResultsState = PlaceholderState | ReadyState<NexusRecentResultRow>;

export type NexusStandingContextState =
  | {
      state: "placeholder";
      message: string;
    }
  | {
      state: "ready";
      /** Primary line, always set when ready */
      message: string;
      /** Optional non-speculative hint */
      hint?: string;
      /** Visual emphasis for headline */
      emphasis?: "strong" | "neutral";
      rank: number;
      tier: string;
      streak: number;
      rating: number;
      earned: number;
      gamesPlayed: number;
    };

export type NexusActivityKind = "game_finished" | "tournament_update" | "player_advance" | "system";

export type NexusActivityRow = {
  id: string;
  type: NexusActivityKind;
  message: string;
  /** ISO timestamp */
  timestamp: string;
  /** Higher = more important (mapping layer). */
  importance: number;
};

export type NexusSystemActivityState = PlaceholderState | ReadyState<NexusActivityRow>;

export type NexusActionCard = {
  id: string;
  title: string;
  description: string;
  href: string;
  /** Lower = higher priority (tie-breaker after urgency). */
  priority: number;
  /** Higher = more urgent (primary sort). */
  urgency: number;
  emphasis?: "primary" | "secondary";
};

export type NexusHubPayload = {
  identity: NexusIdentitySummaryData;
  activeTournaments: NexusTournamentSnapshotState;
  recentResults: NexusRecentResultsState;
  standingContext: NexusStandingContextState;
  systemActivity: NexusSystemActivityState;
  actionCards: NexusActionCard[];
  meta: {
    /** Stable keys when a module is in placeholder mode, e.g. active_tournaments_empty */
    placeholdersUsed: string[];
    generatedAt: string;
    ecosystem: "adult" | "k12";
    isLoggedIn: boolean;
  };
};
