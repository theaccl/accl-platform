import {
  modeOverallRatingTrackId,
  timeControlByRatingTrackId,
  visibleTimeControlsForMode,
  type RatingMode,
} from '@/lib/acclTimeControls';
import type { ProfileHistoryGameRow } from '@/lib/profileRatingHistoryBuild';
import { buildRatingHistoryPointsForTrack } from '@/lib/profileRatingHistoryBuild';
import type { RatingHistoryLedgerRow } from '@/lib/ratingHistoryLedgerBuild';

function distinctGameIdsFromLedgerRows(
  rows: RatingHistoryLedgerRow[],
  playerId: string,
  match: (row: RatingHistoryLedgerRow) => boolean,
): number {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.player_id !== playerId) continue;
    if (row.event_type !== 'game' || row.is_backfilled) continue;
    if (!match(row)) continue;
    if (row.game_id) ids.add(row.game_id);
  }
  return ids.size;
}

function distinctGameIdsFromGamePoints(
  games: ProfileHistoryGameRow[],
  playerId: string,
  ratingTrackId: string,
): number {
  const ids = new Set<string>();
  for (const p of buildRatingHistoryPointsForTrack(games, playerId, ratingTrackId)) {
    if (p.eventType !== 'game' || !p.gameId) continue;
    ids.add(p.gameId);
  }
  return ids.size;
}

/**
 * Exact subtrack only — never uses parent mode aggregate rows or counts.
 */
export function countExactTrackRatedGames(
  ledgerRows: RatingHistoryLedgerRow[],
  games: ProfileHistoryGameRow[],
  playerId: string,
  exactRatingTrackId: string,
): number {
  const def = timeControlByRatingTrackId(exactRatingTrackId);
  if (!def?.badgeTrackKey) return 0;

  const fromLedger = distinctGameIdsFromLedgerRows(ledgerRows, playerId, (row) => {
    if (row.rating_scope !== 'exact_time_control') return false;
    if (row.rating_track_id !== exactRatingTrackId) return false;
    if (row.badge_track_key !== def.badgeTrackKey) return false;
    return true;
  });

  if (fromLedger > 0) return fromLedger;

  return distinctGameIdsFromGamePoints(games, playerId, exactRatingTrackId);
}

/**
 * Mode overall — aggregate across the mode (P1 bucket / mode-scope ledger), not per-exact copy.
 */
export function countModeOverallRatedGames(
  ledgerRows: RatingHistoryLedgerRow[],
  games: ProfileHistoryGameRow[],
  playerId: string,
  mode: RatingMode,
): number {
  const overallId = modeOverallRatingTrackId(mode);

  const fromLedger = distinctGameIdsFromLedgerRows(ledgerRows, playerId, (row) => {
    if (row.rating_scope !== 'mode') return false;
    if (row.rating_track_id !== overallId) return false;
    return true;
  });

  if (fromLedger > 0) return fromLedger;

  return distinctGameIdsFromGamePoints(games, playerId, overallId);
}

/**
 * Build per-track rated-game counts for Profile subtracks.
 * Exact tracks never receive the parent mode aggregate count.
 */
export function mergeAuthoritativeTrackGameCounts(
  ledgerRows: RatingHistoryLedgerRow[],
  games: ProfileHistoryGameRow[],
  playerId: string,
  _trackIds: string[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  const modes: RatingMode[] = ['bullet', 'blitz', 'rapid', 'daily'];

  for (const mode of modes) {
    const overallId = modeOverallRatingTrackId(mode);
    counts[overallId] = countModeOverallRatedGames(ledgerRows, games, playerId, mode);

    for (const def of visibleTimeControlsForMode(mode)) {
      counts[def.ratingTrackId] = countExactTrackRatedGames(
        ledgerRows,
        games,
        playerId,
        def.ratingTrackId,
      );
    }
  }

  return counts;
}
