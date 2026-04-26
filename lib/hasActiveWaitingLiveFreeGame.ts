import type { SupabaseClient } from '@supabase/supabase-js';

import { coercePlatTimeForMode, type PlatMode } from '@/lib/freePlayModeTimeControl';
import {
  type FreePlayQueueTargetSlot,
  freePlayUserBlockedForTargetSlot,
  freePlayUserSeatedInConflictingSlot,
} from '@/lib/freePlayQueueSlotConflict';
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
 * Open seat or full table in the same slot — for Create/Find/accept. Returns resume game id when blocked.
 */
export async function userHasConflictingPlatQueueSlot(
  supabase: SupabaseClient,
  userId: string,
  target: FreePlayQueueTargetSlot
): Promise<string | null | { queryError: true }> {
  if (target.mode === 'daily') {
    return null;
  }
  const { rows, error } = await loadFreePlayBusyUserGames(supabase, userId);
  if (error) {
    return { queryError: true };
  }
  for (const g of rows) {
    if (freePlayUserBlockedForTargetSlot(userId, g, target)) {
      return g.id;
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
