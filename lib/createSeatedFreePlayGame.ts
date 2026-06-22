import type { SupabaseClient } from '@supabase/supabase-js';

import { postAuthenticatedJson } from '@/lib/postAuthenticatedJson';

async function bestEffortInvalidateLiveAfterSeatedFromClient(
  supabase: SupabaseClient,
  game: { id?: string; white_player_id?: string; black_player_id?: string | null; tempo?: string | null }
): Promise<void> {
  if (typeof window === 'undefined') return;
  const t = String(game?.tempo ?? '')
    .trim()
    .toLowerCase();
  if (t !== 'live' || !game.id) return;
  if (!game.white_player_id || !game.black_player_id) return;
  const { data: s } = await supabase.auth.getSession();
  const token = s.session?.access_token;
  if (!token) return;
  const ids = [...new Set([game.white_player_id, game.black_player_id].filter(Boolean))] as string[];
  try {
    const res = await fetch(
      typeof window === 'undefined' ? '' : `${window.location.origin}/api/match-requests/invalidate-live-availability`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userIds: ids,
          excludeGameId: game.id,
        }),
      }
    );
    if (!res.ok && process.env.NODE_ENV === 'development') {
      const j = await res.json().catch(() => ({}));
      console.warn('[createSeatedGameGuard] invalidate-live-availability', res.status, j);
    }
  } catch (e) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[createSeatedGameGuard] invalidate-live-availability', e);
    }
  }
}

function debugCreateSeatedGameGuardEnabled(): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  if (process.env.NEXT_PUBLIC_ACCL_DEBUG_CREATE_SEATED_GAME_GUARD === '1') return true;
  if (typeof window !== 'undefined' && window.localStorage?.getItem('accl_debug_create_seated_game_guard') === '1') {
    return true;
  }
  return false;
}

async function createSeatedGameGuardViaApi(
  supabase: SupabaseClient,
  args: {
    existingOpenSeatId?: string | null;
    row: Record<string, unknown>;
  }
) {
  const res = await postAuthenticatedJson(supabase, '/api/free-play/create-seated-game', {
    existingOpenSeatId: args.existingOpenSeatId ?? null,
    row: args.row,
  });
  const payload = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    game?: unknown;
    code?: string;
    error?: string;
  };
  if (!res.ok) {
    return { data: null, error: { message: payload.error ?? 'Could not seat game.' } };
  }
  const row = payload.game ?? null;
  if (row && typeof row === 'object' && 'white_player_id' in row && 'black_player_id' in (row as object)) {
    const g = row as {
      id?: string;
      white_player_id?: string;
      black_player_id?: string | null;
      tempo?: string | null;
    };
    if (g.black_player_id && g.white_player_id) {
      void bestEffortInvalidateLiveAfterSeatedFromClient(supabase, g);
    }
  }
  return { data: row, error: null };
}

/**
 * Free-play only: server-side busy checks + stale open-seat cleanup + insert or open-seat join.
 * See `20260522120000_create_seated_game_guard_postgrest_param_names.sql` (`create_seated_game_guard`).
 *
 * Known call sites in this repo (grep `createSeatedGameGuard(`):
 * - `app/game/[id]/page.tsx` — `?join=1` open-seat seating as Black.
 * - `lib/freePlayFindMatch.ts` — Find match / join compatible open seat.
 *
 * Browser callers use `POST /api/free-play/create-seated-game` (email verification gate + actor checks).
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
  if (typeof window !== 'undefined') {
    if (debugCreateSeatedGameGuardEnabled()) {
      const row = args.row ?? {};
      const tempo = typeof row.tempo === 'string' ? row.tempo : null;
      const ltc = typeof row.live_time_control === 'string' ? row.live_time_control : null;
      const ctx = typeof row.play_context === 'string' ? row.play_context : null;
      console.warn('[accl-debug] create_seated_game_guard API call', {
        existingOpenSeatId: args.existingOpenSeatId ?? null,
        play_context: ctx,
        tempo,
        live_time_control: ltc,
        stack: process.env.NODE_ENV === 'development' ? new Error('createSeatedGameGuard').stack : undefined,
      });
    }
    return createSeatedGameGuardViaApi(supabase, args);
  }

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
    });
  }
  const res = await supabase.rpc('create_seated_game_guard', {
    existing_open_seat_id: args.existingOpenSeatId ?? null,
    payload: args.row,
  });
  if (res.error) return res;
  const raw = res.data as unknown;
  const row = Array.isArray(raw) ? raw[0] : raw;
  return { data: row ?? null, error: null };
}
