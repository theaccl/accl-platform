/**
 * Client entrypoint for free-play rating application (server work is done in DB trigger + RPC).
 * Use this when you need an explicit RPC round-trip after `finish_game` returns a row that might omit `rating_last_update`,
 * or for tooling/tests. Normal finishes rely on `games_apply_free_rating_after_finish` trigger.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  classifyGameForRating,
  shouldApplyImmediateFreePlayRating,
  type GameRowRatingInput,
} from '@/lib/ratingClassification';

export type FreePlayRatingRpcPayload = Record<string, unknown>;

export type ApplyFreePlayRatingResult =
  | { skipped: true; reason: string }
  | { skipped: false; payload: FreePlayRatingRpcPayload };

function normalizePlayContext(raw: string | null | undefined): 'free' | 'tournament' {
  const s = String(raw ?? 'free').toLowerCase().trim();
  return s === 'tournament' ? 'tournament' : 'free';
}

/**
 * Calls `classifyGameForRating`, enforces free + rated + immediate, then invokes `apply_free_play_rating_update` RPC.
 * The RPC re-validates participation when called from the client. If the trigger already applied the update, the RPC
 * returns a snapshot with `reason: already_applied`.
 */
export async function applyFreePlayRatingUpdate(
  client: SupabaseClient,
  game: GameRowRatingInput & { id: string }
): Promise<ApplyFreePlayRatingResult> {
  const c = classifyGameForRating(game);
  if (!shouldApplyImmediateFreePlayRating(c)) {
    return { skipped: true, reason: c.skipReason ?? 'not_immediate_eligible' };
  }
  if (game.rated !== true) {
    return { skipped: true, reason: 'unrated' };
  }
  if (normalizePlayContext(game.play_context) !== 'free') {
    return { skipped: true, reason: 'not_free_play' };
  }

  const { data, error } = await client.rpc('apply_free_play_rating_update', { p_game_id: game.id });
  if (error) {
    throw error;
  }
  return { skipped: false, payload: (data ?? {}) as FreePlayRatingRpcPayload };
}
