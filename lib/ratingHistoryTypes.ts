/**
 * Profile rating ticker history point contract (UI + builders).
 * Backend ledger may grow into this shape; until then points come only from authoritative game payloads.
 */

export type RatingHistoryEcosystem = 'free' | 'tournament' | 'global';

export type RatingHistoryMode = 'bullet' | 'blitz' | 'rapid' | 'daily';

export type RatingHistoryEventType =
  | 'game'
  | 'tournament_batch'
  | 'bracket_settlement'
  | 'manual_admin_adjustment'
  | 'backfill';

export type RatingHistoryResult = 'win' | 'loss' | 'draw' | 'event_settlement';

export type BadgeState = 'normal' | 'shiny' | 'downgraded';

export type BadgeEvent =
  | 'none'
  | 'upgrade_armed'
  | 'upgrade_confirmed'
  | 'downgrade_armed'
  | 'downgrade_confirmed'
  | 'recovered_to_normal'
  | 'shiny_earned'
  | 'shiny_lost'
  | 'manual_adjustment'
  | null;

export type BoundaryStatus =
  | 'safe'
  | 'on_the_rise'
  | 'upgrade_armed'
  | 'at_risk'
  | 'downgrade_armed'
  | 'recovery_needed';

export type RatingHistoryPoint = {
  id: string;
  playerId: string;
  ratingTrackId: string;
  ecosystem: RatingHistoryEcosystem;
  mode?: RatingHistoryMode | null;
  timeControl?: string | null;
  eventType: RatingHistoryEventType;
  gameId?: string | null;
  tournamentId?: string | null;
  bracketId?: string | null;
  opponentId?: string | null;
  opponentUsername?: string | null;
  result: RatingHistoryResult;
  ratingBefore: number;
  ratingAfter: number;
  ratingDelta: number;
  occurredAt: string;
  badgeStateBefore?: BadgeState | null;
  badgeStateAfter?: BadgeState | null;
  badgeEvent?: BadgeEvent;
  streakBefore?: number | null;
  streakAfter?: number | null;
  metadata?: Record<string, unknown>;
};

export type ProfileRatingTrackKind = 'accl' | 'tournament' | 'mode' | 'exact';

export type ProfileTopLevelTrackId =
  | 'accl'
  | 'tournament'
  | 'free_bullet'
  | 'free_blitz'
  | 'free_rapid'
  | 'free_day';
