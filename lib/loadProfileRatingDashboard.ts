import type { SupabaseClient } from '@supabase/supabase-js';

import type { PlayerBadgeStateRow } from '@/lib/badgeSettlement';
import type { FreeBadgeTrackKey } from '@/lib/badgeTracks';
import { timeControlByBadgeTrackKey } from '@/lib/acclTimeControls';
import { buildRatingHistoryPointsForTrack, type ProfileHistoryGameRow } from '@/lib/profileRatingHistoryBuild';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';

export type ProfileBadgeStateByTrack = Partial<Record<string, PlayerBadgeStateRow>>;

export type ProfileRatingDashboardData = {
  historyByTrack: Record<string, RatingHistoryPoint[]>;
  badgeByTrack: ProfileBadgeStateByTrack;
};

const HISTORY_GAME_LIMIT = 120;

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
    return { historyByTrack: {}, badgeByTrack: {} };
  }

  const [gamesRes, badgeRes] = await Promise.all([
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
  ]);

  const games = (gamesRes.data ?? []) as ProfileHistoryGameRow[];
  const historyByTrack: Record<string, RatingHistoryPoint[]> = {};
  for (const trackId of trackIds) {
    historyByTrack[trackId] = buildRatingHistoryPointsForTrack(games, profileUserId, trackId);
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

  return { historyByTrack, badgeByTrack };
}
