import type { SupabaseClient } from '@supabase/supabase-js';

import { rowIndicatesLiveFreePlayPacing } from '@/lib/freePlayLiveSession';
import { createServiceRoleClient } from '@/lib/supabaseServiceRoleClient';

const LIVE_BUSY_LOOKBACK = 120;

/**
 * Bypasses RLS (service role) to detect whether the user is in an active/waiting **live-paced** free game.
 * Use from trusted server routes only (e.g. match accept API).
 */
export async function userHasActiveWaitingLiveFreeGameAdmin(userId: string): Promise<boolean> {
  const uid = userId.trim();
  if (!uid) return false;

  let admin: SupabaseClient;
  try {
    admin = createServiceRoleClient();
  } catch {
    return true;
  }

  const { data, error } = await admin
    .from('games')
    .select('id,tempo,live_time_control')
    .eq('play_context', 'free')
    .is('tournament_id', null)
    .in('status', ['active', 'waiting'])
    .or(`white_player_id.eq.${uid},black_player_id.eq.${uid}`)
    .order('created_at', { ascending: false })
    .limit(LIVE_BUSY_LOOKBACK);

  if (error) {
    console.warn('[userHasActiveWaitingLiveFreeGameAdmin] games select failed — treating as busy', error.message);
    return true;
  }
  if (!data?.length) return false;

  return (data as { tempo?: string | null; live_time_control?: string | null }[]).some((g) =>
    rowIndicatesLiveFreePlayPacing(g)
  );
}

/** Seated live free game only — for secured join-open flows. */
export async function userInLiveFreeSeatedGameAdmin(userId: string): Promise<boolean> {
  const uid = userId.trim();
  if (!uid) return false;

  let admin: SupabaseClient;
  try {
    admin = createServiceRoleClient();
  } catch {
    return true;
  }

  const { data, error } = await admin
    .from('games')
    .select('id,tempo,live_time_control')
    .eq('play_context', 'free')
    .is('tournament_id', null)
    .in('status', ['active', 'waiting'])
    .not('black_player_id', 'is', null)
    .or(`white_player_id.eq.${uid},black_player_id.eq.${uid}`)
    .order('created_at', { ascending: false })
    .limit(LIVE_BUSY_LOOKBACK);

  if (error) {
    console.warn('[userInLiveFreeSeatedGameAdmin] games select failed — treating as busy', error.message);
    return true;
  }
  if (!data?.length) return false;

  return (data as { tempo?: string | null; live_time_control?: string | null }[]).some((g) =>
    rowIndicatesLiveFreePlayPacing(g)
  );
}
