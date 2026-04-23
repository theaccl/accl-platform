import type { SupabaseClient } from '@supabase/supabase-js';

function debugCreateSeatedGameGuardEnabled(): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  if (process.env.NEXT_PUBLIC_ACCL_DEBUG_CREATE_SEATED_GAME_GUARD === '1') return true;
  if (typeof window !== 'undefined' && window.localStorage?.getItem('accl_debug_create_seated_game_guard') === '1') {
    return true;
  }
  return false;
}

/**
 * Free-play only: server-side busy checks + stale open-seat cleanup + insert or open-seat join.
 * See `20260522120000_create_seated_game_guard_postgrest_param_names.sql` (`create_seated_game_guard`).
 *
 * Known call sites in this repo (grep `createSeatedGameGuard(`):
 * - `app/game/[id]/page.tsx` — `?join=1` open-seat seating as Black.
 * - `lib/freePlayFindMatch.ts` — Find match / join compatible open seat.
 *
 * `/requests` **direct** match inbox accept uses `POST /api/match-requests/accept`.
 * Open/public listing join uses `POST /api/match-requests/join-open-listing`.
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
  if (debugCreateSeatedGameGuardEnabled()) {
    const row = args.row ?? {};
    const tempo = typeof row.tempo === 'string' ? row.tempo : null;
    const ltc = typeof row.live_time_control === 'string' ? row.live_time_control : null;
    const ctx = typeof row.play_context === 'string' ? row.play_context : null;
    console.warn('[accl-debug] create_seated_game_guard RPC call', {
      existingOpenSeatId: args.existingOpenSeatId ?? null,
      play_context: ctx,
      tempo,
      live_time_control: ltc,
      stack: process.env.NODE_ENV === 'development' ? new Error('createSeatedGameGuard').stack : undefined,
    });
  }
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
