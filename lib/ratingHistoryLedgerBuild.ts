import { timeControlByRatingTrackId } from '@/lib/acclTimeControls';
import { badgeEventFromSettlementEvent } from '@/lib/profileBadgeBoundary';
import type { BadgeSettlementEventType } from '@/lib/badgeSettlement';
import type { RatingHistoryPoint, RatingHistoryResult } from '@/lib/ratingHistoryTypes';

/** Row shape from `player_rating_history_ledger` (self-read via RLS or RPC). */
export type RatingHistoryLedgerRow = {
  id: string;
  player_id: string;
  rating_track_id: string;
  ecosystem: string;
  rating_scope: string;
  mode: string | null;
  time_control: string | null;
  badge_track_key: string | null;
  event_type: string;
  game_id: string | null;
  tournament_id: string | null;
  bracket_id: string | null;
  opponent_id: string | null;
  opponent_username: string | null;
  result: string | null;
  rating_before: number;
  rating_after: number;
  rating_delta: number;
  occurred_at: string;
  badge_state_before: string | null;
  badge_state_after: string | null;
  badge_event: string | null;
  streak_before: number | null;
  streak_after: number | null;
  is_backfilled: boolean;
  metadata: Record<string, unknown> | null;
};

function ledgerTrackMatchesProfileTrack(
  ledgerTrackId: string,
  profileTrackId: string,
): boolean {
  if (ledgerTrackId === profileTrackId) return true;
  // O1-A: ACCL Overall track never ingests tournament ledger rows (pre-O2: empty history is correct).
  if (profileTrackId === 'accl' && ledgerTrackId === 'accl_overall') return true;
  return false;
}

function mapResult(raw: string | null): RatingHistoryResult {
  if (raw === 'win' || raw === 'loss' || raw === 'draw' || raw === 'event_settlement') {
    return raw;
  }
  return 'draw';
}

function mapBadgeState(raw: string | null) {
  if (!raw) return null;
  if (raw === 'shiny' || raw === 'upgraded') return 'shiny' as const;
  if (raw === 'downgraded' || raw === 'cracked') return 'downgraded' as const;
  if (raw === 'normal' || raw === 'recovery') return 'normal' as const;
  return null;
}

function mapBadgeEvent(raw: string | null): RatingHistoryPoint['badgeEvent'] {
  if (!raw || raw === 'none') return 'none';
  const ledgerEvents = new Set([
    'upgrade_armed',
    'upgrade_confirmed',
    'downgrade_armed',
    'downgrade_confirmed',
    'recovered_to_normal',
    'shiny_earned',
    'shiny_lost',
    'manual_adjustment',
  ]);
  if (ledgerEvents.has(raw)) {
    return raw as NonNullable<RatingHistoryPoint['badgeEvent']>;
  }
  return badgeEventFromSettlementEvent(raw as BadgeSettlementEventType);
}

function mapEventType(raw: string): RatingHistoryPoint['eventType'] {
  if (raw === 'backfill') return 'backfill';
  if (
    raw === 'game' ||
    raw === 'tournament_batch' ||
    raw === 'bracket_settlement' ||
    raw === 'manual_admin_adjustment'
  ) {
    return raw;
  }
  return 'game';
}

function mapEcosystem(raw: string): RatingHistoryPoint['ecosystem'] {
  if (raw === 'tournament') return 'tournament';
  if (raw === 'global') return 'global';
  return 'free';
}

/**
 * Build profile ticker points from ledger rows for one track.
 * Never fabricates — only rows that match the profile track id.
 */
export function buildRatingHistoryPointsFromLedger(
  rows: RatingHistoryLedgerRow[],
  playerId: string,
  ratingTrackId: string,
): RatingHistoryPoint[] {
  const def = timeControlByRatingTrackId(ratingTrackId);
  const isExact = Boolean(def?.badgeTrackKey);

  const points: RatingHistoryPoint[] = [];

  for (const row of rows) {
    if (row.player_id !== playerId) continue;
    if (!ledgerTrackMatchesProfileTrack(row.rating_track_id, ratingTrackId)) continue;

    if (isExact) {
      if (row.rating_scope !== 'exact_time_control') continue;
      if (def?.badgeTrackKey && row.badge_track_key !== def.badgeTrackKey) continue;
    } else if (row.rating_scope === 'exact_time_control') {
      continue;
    }

    const mode =
      row.mode === 'bullet' ||
      row.mode === 'blitz' ||
      row.mode === 'rapid' ||
      row.mode === 'daily'
        ? row.mode
        : def?.mode ?? null;

    points.push({
      id: row.id,
      playerId,
      ratingTrackId,
      ecosystem: mapEcosystem(row.ecosystem),
      mode,
      timeControl: row.time_control ?? def?.displayValue ?? null,
      eventType: mapEventType(row.event_type),
      gameId: row.game_id,
      tournamentId: row.tournament_id,
      bracketId: row.bracket_id,
      opponentId: row.opponent_id,
      opponentUsername: row.opponent_username,
      result: mapResult(row.result),
      ratingBefore: row.rating_before,
      ratingAfter: row.rating_after,
      ratingDelta: row.rating_delta,
      occurredAt: row.occurred_at,
      badgeStateBefore: mapBadgeState(row.badge_state_before),
      badgeStateAfter: mapBadgeState(row.badge_state_after),
      badgeEvent: mapBadgeEvent(row.badge_event),
      streakBefore: row.streak_before,
      streakAfter: row.streak_after,
      metadata: {
        ...(row.metadata ?? {}),
        ...(row.is_backfilled ? { backfill: true, backfill_source: 'games.rating_last_update' } : {}),
      },
    });
  }

  return points.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}
