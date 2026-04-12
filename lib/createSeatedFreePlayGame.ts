import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Free-play only: transactional supersede of other seated actives + insert or open-seat join.
 * See migration `20260410120000_free_play_lifecycle_guard.sql` (`create_seated_game_guard`).
 */
export async function createSeatedGameGuard(
  supabase: SupabaseClient,
  args: {
    /** When set, seats `p_row.black_player_id` on this open seat (must still have black null). */
    existingOpenSeatId?: string | null;
    /** Same shape as `gameInsertFromAcceptedChallenge` / `casualTwoPlayerGameInsert` (JSON-serializable). */
    row: Record<string, unknown>;
  }
) {
  return supabase.rpc('create_seated_game_guard', {
    p_existing_open_seat_id: args.existingOpenSeatId ?? null,
    p_row: args.row,
  });
}
