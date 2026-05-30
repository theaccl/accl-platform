import type { SupabaseClient } from '@supabase/supabase-js';

import { coercePlatTimeForMode, type PlatMode } from '@/lib/freePlayModeTimeControl';
import {
  type FreePlayQueueTargetSlot,
  freePlayUserBlockedForTargetSlot,
  freePlayUserSeatedInAnyActiveLiveGame,
  freePlayUserSeatedInConflictingSlot,
} from '@/lib/freePlayQueueSlotConflict';
import {
  type QueueConflict,
  classifyFreePlayQueueConflict,
} from '@/lib/classifyFreePlayQueueConflict';
import { platBucketForOpenSeat } from '@/lib/platOpenSeatBucket';

const BUSY_LOOKBACK = 120;
const FREE_BUSY_SELECT =
  'id,white_player_id,black_player_id,tempo,live_time_control,rated,status' as const;

export type FreePlayBusyUserGameRow = {
  id: string;
  white_player_id: string;
  black_player_id: string | null;
  tempo: string | null;
  live_time_control: string | null;
  rated: boolean | null;
  status?: string | null;
};

/** RLS: active/waiting free (non-tournament) games the user is on in any color. */
export async function loadFreePlayBusyUserGames(
  supabase: SupabaseClient,
  userId: string
): Promise<{ rows: FreePlayBusyUserGameRow[]; error: true } | { rows: FreePlayBusyUserGameRow[]; error: false }> {
  const uid = userId.trim();
  if (!uid) {
    return { rows: [], error: false };
  }
  const { data, error } = await supabase
    .from('games')
    .select(FREE_BUSY_SELECT)
    .eq('play_context', 'free')
    .is('tournament_id', null)
    .in('status', ['active', 'waiting'])
    .or(`white_player_id.eq.${uid},black_player_id.eq.${uid}`)
    .order('created_at', { ascending: false })
    .limit(BUSY_LOOKBACK);

  if (error) {
    return { rows: [], error: true };
  }
  return { rows: (data ?? []) as FreePlayBusyUserGameRow[], error: false };
}

export function freePlayTargetSlotFromGameOrRequestFields(input: {
  tempo: string | null | undefined;
  live_time_control: string | null | undefined;
  rated: boolean;
}): FreePlayQueueTargetSlot | null {
  const m = platBucketForOpenSeat(input.tempo ?? null, input.live_time_control ?? null);
  if (m == null) return null;
  return {
    mode: m,
    clock: coercePlatTimeForMode(m, String(input.live_time_control ?? '')),
    rated: input.rated,
  };
}

/**
 * Seated in a two-player free game in the same PLAT slot (mode+clock+rated) as `target` — e.g. join a live open seat
 * while you already have Blitz+ should not block Rapid+.
 */
export async function userInSeatedInSamePlatQueueSlot(
  supabase: SupabaseClient,
  userId: string,
  target: FreePlayQueueTargetSlot
): Promise<boolean> {
  if (target.mode === 'daily') {
    return false;
  }
  const { rows, error } = await loadFreePlayBusyUserGames(supabase, userId);
  if (error) return true;
  for (const g of rows) {
    if (freePlayUserSeatedInConflictingSlot(userId, g, target)) {
      return true;
    }
  }
  return false;
}

/**
 * Open seat or full table in the same slot — for Create/Find/accept. Returns an enriched
 * {@link QueueConflict} when blocked so callers can distinguish an own unmatched waiting
 * seat from a seated live game. Authority is unchanged: this still blocks identically.
 */
export async function userHasConflictingPlatQueueSlot(
  supabase: SupabaseClient,
  userId: string,
  target: FreePlayQueueTargetSlot
): Promise<QueueConflict | null | { queryError: true }> {
  if (target.mode === 'daily') {
    return null;
  }
  const { rows, error } = await loadFreePlayBusyUserGames(supabase, userId);
  if (error) {
    return { queryError: true };
  }
  for (const g of rows) {
    if (freePlayUserBlockedForTargetSlot(userId, g, target)) {
      const kind =
        classifyFreePlayQueueConflict(
          {
            white_player_id: g.white_player_id,
            black_player_id: g.black_player_id,
            status: g.status ?? null,
            tempo: g.tempo,
          },
          userId
        ) ?? 'seated_live_game';
      return {
        gameId: g.id,
        kind,
        whitePlayerId: g.white_player_id,
        blackPlayerId: g.black_player_id,
        tempo: g.tempo,
        liveTimeControl: g.live_time_control,
        rated: g.rated,
      };
    }
  }
  return null;
}

function seatedLiveConflict(g: FreePlayBusyUserGameRow): QueueConflict {
  return {
    gameId: g.id,
    kind: 'seated_live_game',
    whitePlayerId: g.white_player_id,
    blackPlayerId: g.black_player_id,
    tempo: g.tempo,
    liveTimeControl: g.live_time_control,
    rated: g.rated,
  };
}

/**
 * P0 create/find gate: load the user's free busy games once, then enforce two rules:
 *
 * 1. **Global seated-live block (cross-slot):** if the user is seated in ANY active
 *    two-player live game, block every new live seat — regardless of mode/clock/rated.
 * 2. **Slot-scoped block:** the existing same-slot open-seat / seated rule for the
 *    requested target (preserves multi-slot waiting-seat doctrine when NOT seated).
 *
 * Returns an enriched {@link QueueConflict} when blocked, else null. Daily targets are
 * never blocked here.
 */
export async function userBlockedFromNewLiveSeatOrSlot(
  supabase: SupabaseClient,
  userId: string,
  target: FreePlayQueueTargetSlot
): Promise<QueueConflict | null | { queryError: true }> {
  if (target.mode === 'daily') {
    return null;
  }
  const { rows, error } = await loadFreePlayBusyUserGames(supabase, userId);
  if (error) {
    return { queryError: true };
  }

  const seatedLive = freePlayUserSeatedInAnyActiveLiveGame(rows, userId);
  if (seatedLive) {
    return seatedLiveConflict(seatedLive);
  }

  for (const g of rows) {
    if (freePlayUserBlockedForTargetSlot(userId, g, target)) {
      const kind =
        classifyFreePlayQueueConflict(
          {
            white_player_id: g.white_player_id,
            black_player_id: g.black_player_id,
            status: g.status ?? null,
            tempo: g.tempo,
          },
          userId
        ) ?? 'seated_live_game';
      return {
        gameId: g.id,
        kind,
        whitePlayerId: g.white_player_id,
        blackPlayerId: g.black_player_id,
        tempo: g.tempo,
        liveTimeControl: g.live_time_control,
        rated: g.rated,
      };
    }
  }
  return null;
}

/** @deprecated for match flows — use `userInSeatedInSamePlatQueueSlot` with the open-seat slot. */
export async function userInLiveFreeSeatedGame(
  supabase: SupabaseClient,
  userId: string,
  openSeatSlot: FreePlayQueueTargetSlot
): Promise<boolean> {
  return userInSeatedInSamePlatQueueSlot(supabase, userId, openSeatSlot);
}
