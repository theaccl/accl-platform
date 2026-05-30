import type { SupabaseClient } from '@supabase/supabase-js';

import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';
import {
  type FreePlayQueueTargetSlot,
  freePlayUserBlockedForTargetSlot,
  freePlayUserSeatedInAnyActiveLiveGame,
  freePlayUserSeatedInConflictingSlot,
} from '@/lib/freePlayQueueSlotConflict';

const BUSY_LOOKBACK = 120;
const FREE_BUSY_SELECT =
  'id,white_player_id,black_player_id,tempo,live_time_control,rated,status' as const;

type Mine = {
  id: string;
  white_player_id: string;
  black_player_id: string | null;
  tempo: string | null;
  live_time_control: string | null;
  rated: boolean | null;
  status?: string | null;
};

async function loadFreePlayBusyUserGamesAdmin(userId: string): Promise<
  { rows: Mine[]; error: true } | { rows: Mine[]; error: false }
> {
  const uid = userId.trim();
  if (!uid) {
    return { rows: [], error: false };
  }
  let admin: SupabaseClient;
  try {
    admin = createServiceRoleClient();
  } catch {
    return { rows: [], error: true };
  }

  const { data, error } = await admin
    .from('games')
    .select(FREE_BUSY_SELECT)
    .eq('play_context', 'free')
    .is('tournament_id', null)
    .in('status', ['active', 'waiting'])
    .or(`white_player_id.eq.${uid},black_player_id.eq.${uid}`)
    .order('created_at', { ascending: false })
    .limit(BUSY_LOOKBACK);

  if (error) {
    console.warn('[loadFreePlayBusyUserGamesAdmin] select failed', error.message);
    return { rows: [], error: true };
  }
  return { rows: (data ?? []) as Mine[], error: false };
}

export async function userHasConflictingPlatQueueSlotAdmin(
  userId: string,
  target: FreePlayQueueTargetSlot
): Promise<string | null | { queryError: true }> {
  if (target.mode === 'daily') {
    return null;
  }
  const { rows, error } = await loadFreePlayBusyUserGamesAdmin(userId);
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

/**
 * P0 cross-slot authority (service-role): is the user seated in ANY active two-player
 * live free-play game? Used by the direct-insert API routes (challenge accept /
 * open-listing join) which bypass `create_seated_game_guard`. Returns the seated game
 * id, null, or a query error. Not slot-scoped — mirrors the create-side gate.
 */
export async function userSeatedInAnyActiveLiveFreeGameAdmin(
  userId: string
): Promise<{ seatedGameId: string } | null | { queryError: true }> {
  const uid = userId.trim();
  if (!uid) {
    return null;
  }
  const { rows, error } = await loadFreePlayBusyUserGamesAdmin(uid);
  if (error) {
    return { queryError: true };
  }
  const seated = freePlayUserSeatedInAnyActiveLiveGame(rows, uid);
  return seated ? { seatedGameId: seated.id } : null;
}

export async function userInSeatedInSamePlatQueueSlotAdmin(
  userId: string,
  target: FreePlayQueueTargetSlot
): Promise<{ blocked: true } | { blocked: false } | { queryError: true }> {
  if (target.mode === 'daily') {
    return { blocked: false };
  }
  const { rows, error } = await loadFreePlayBusyUserGamesAdmin(userId);
  if (error) {
    return { queryError: true };
  }
  for (const g of rows) {
    if (freePlayUserSeatedInConflictingSlot(userId, g, target)) {
      return { blocked: true };
    }
  }
  return { blocked: false };
}

