import type { SupabaseClient } from '@supabase/supabase-js';

import type { PlayerBadgeStateRow } from '@/lib/badgeSettlement';
import type { FreeBadgeTrackKey } from '@/lib/badgeTracks';
import { timeControlByBadgeTrackKey } from '@/lib/acclTimeControls';
import { buildRatingHistoryPointsForTrack, type ProfileHistoryGameRow } from '@/lib/profileRatingHistoryBuild';
import { mergeAuthoritativeTrackGameCounts } from '@/lib/profileRatingTrackGameCounts';
import {
  buildRatingHistoryPointsFromLedger,
  type RatingHistoryLedgerRow,
} from '@/lib/ratingHistoryLedgerBuild';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';

export type ProfileBadgeStateByTrack = Partial<Record<string, PlayerBadgeStateRow>>;
export type ProfileRatingHistorySource = 'ledger' | 'games' | 'none' | 'unknown';

export type ProfileRatingDashboardData = {
  historyByTrack: Record<string, RatingHistoryPoint[]>;
  historySourceByTrack: Record<string, ProfileRatingHistorySource>;
  badgeByTrack: ProfileBadgeStateByTrack;
  gamesCountByTrack: Record<string, number>;
};

const HISTORY_GAME_LIMIT = 120;
const LEDGER_HISTORY_LIMIT = 500;

export function classifyProfileRatingHistorySource(input: {
  ledgerPointCount: number;
  gamePointCount: number;
  ledgerSampleComplete: boolean;
  gameSampleComplete: boolean;
}): ProfileRatingHistorySource {
  if (input.ledgerPointCount > 0) return 'ledger';
  if (input.gamePointCount > 0) {
    return input.ledgerSampleComplete ? 'games' : 'unknown';
  }
  return input.ledgerSampleComplete && input.gameSampleComplete ? 'none' : 'unknown';
}

/**
 * Loads self-only dashboard enrichment (badge rows + per-game rating snapshots).
 * Public viewers receive empty maps — never fabricated.
 */
export async function loadProfileRatingDashboardData(
  supabase: SupabaseClient,
  profileUserId: string,
  isSelf: boolean,
  trackIds: string[],
): Promise<ProfileRatingDashboardData> {
  if (!isSelf) {
    return { historyByTrack: {}, historySourceByTrack: {}, badgeByTrack: {}, gamesCountByTrack: {} };
  }

  const [gamesRes, badgeRes, ledgerRes] = await Promise.all([
    supabase
      .from('games')
      .select(
        'id,finished_at,created_at,white_player_id,black_player_id,play_context,tempo,live_time_control,rated,rating_applied,rating_last_update,result',
      )
      .eq('status', 'finished')
      .eq('rated', true)
      .or(`white_player_id.eq.${profileUserId},black_player_id.eq.${profileUserId}`)
      .order('finished_at', { ascending: false })
      .limit(HISTORY_GAME_LIMIT),
    supabase
      .from('player_badge_state')
      .select(
        'track_key,settlement_rating,active_rank_band,visual_state,pressure_state,pressure_border,win_streak',
      )
      .eq('user_id', profileUserId),
    supabase
      .from('player_rating_history_ledger')
      .select(
        'id,player_id,rating_track_id,ecosystem,rating_scope,mode,time_control,badge_track_key,event_type,game_id,tournament_id,bracket_id,opponent_id,opponent_username,result,rating_before,rating_after,rating_delta,occurred_at,badge_state_before,badge_state_after,badge_event,streak_before,streak_after,is_backfilled,metadata',
      )
      .eq('player_id', profileUserId)
      .order('occurred_at', { ascending: true })
      .limit(LEDGER_HISTORY_LIMIT),
  ]);

  const games = (gamesRes.data ?? []) as ProfileHistoryGameRow[];
  const ledgerRows = (ledgerRes.error ? [] : (ledgerRes.data ?? [])) as RatingHistoryLedgerRow[];
  const gameSampleComplete = !gamesRes.error && games.length < HISTORY_GAME_LIMIT;
  const ledgerSampleComplete = !ledgerRes.error && ledgerRows.length < LEDGER_HISTORY_LIMIT;
  const historyByTrack: Record<string, RatingHistoryPoint[]> = {};
  const historySourceByTrack: Record<string, ProfileRatingHistorySource> = {};
  for (const trackId of trackIds) {
    const fromLedger = buildRatingHistoryPointsFromLedger(ledgerRows, profileUserId, trackId);
    const fromGames = buildRatingHistoryPointsForTrack(games, profileUserId, trackId);
    historyByTrack[trackId] = fromLedger.length > 0 ? fromLedger : fromGames;
    historySourceByTrack[trackId] = classifyProfileRatingHistorySource({
      ledgerPointCount: fromLedger.length,
      gamePointCount: fromGames.length,
      ledgerSampleComplete,
      gameSampleComplete,
    });
  }

  const badgeByTrack: ProfileBadgeStateByTrack = {};
  if (!badgeRes.error && badgeRes.data) {
    for (const row of badgeRes.data) {
      const key = row.track_key as FreeBadgeTrackKey;
      const def = timeControlByBadgeTrackKey(key);
      const trackId = def?.ratingTrackId ?? key;
      badgeByTrack[trackId] = {
        track_key: key,
        settlement_rating: row.settlement_rating,
        active_rank_band: row.active_rank_band,
        visual_state: row.visual_state,
        pressure_state: row.pressure_state,
        pressure_border: row.pressure_border,
        win_streak: row.win_streak,
      };
    }
  }

  const gamesCountByTrack = mergeAuthoritativeTrackGameCounts(
    ledgerRows,
    games,
    profileUserId,
    trackIds,
  );

  return { historyByTrack, historySourceByTrack, badgeByTrack, gamesCountByTrack };
}
