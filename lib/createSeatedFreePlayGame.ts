import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Free-play only: server-side busy checks + stale open-seat cleanup + insert or open-seat join.
 * See `20260522120000_create_seated_game_guard_postgrest_param_names.sql` (`create_seated_game_guard`).
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
  // PostgREST binds JSON keys to PostgreSQL parameter names — must match `create_seated_game_guard` args.
  const res = await supabase.rpc('create_seated_game_guard', {
    existing_open_seat_id: args.existingOpenSeatId ?? null,
    payload: args.row,
  });
  if (res.error) return res;
  const raw = res.data as unknown;
  const row = Array.isArray(raw) ? raw[0] : raw;
  return { data: row ?? null, error: null };
}
