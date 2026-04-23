import type { SupabaseClient } from '@supabase/supabase-js';

import { rowIndicatesLiveFreePlayPacing } from '@/lib/freePlayLiveSession';

const LIVE_BUSY_LOOKBACK = 120;

/** True if the user participates in any active/waiting **live-paced** free (non-tournament) game row (including open seats). */
export async function userHasActiveWaitingLiveFreeGame(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const uid = userId.trim();
  if (!uid) return false;

  const { data, error } = await supabase
    .from('games')
    .select('id,tempo,live_time_control')
    .eq('play_context', 'free')
    .is('tournament_id', null)
    .in('status', ['active', 'waiting'])
    .or(`white_player_id.eq.${uid},black_player_id.eq.${uid}`)
    .order('created_at', { ascending: false })
    .limit(LIVE_BUSY_LOOKBACK);

  if (error) return true;
  if (!data?.length) return false;
  return (data as { tempo?: string | null; live_time_control?: string | null }[]).some((g) =>
    rowIndicatesLiveFreePlayPacing(g)
  );
}

/** True if the user is in a **seated** (both colors) active/waiting live-paced free game — used before joining another live seat. */
export async function userInLiveFreeSeatedGame(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const uid = userId.trim();
  if (!uid) return false;

  const { data, error } = await supabase
    .from('games')
    .select('id,tempo,live_time_control')
    .eq('play_context', 'free')
    .is('tournament_id', null)
    .in('status', ['active', 'waiting'])
    .not('black_player_id', 'is', null)
    .or(`white_player_id.eq.${uid},black_player_id.eq.${uid}`)
    .order('created_at', { ascending: false })
    .limit(LIVE_BUSY_LOOKBACK);

  if (error) return true;
  if (!data?.length) return false;
  return (data as { tempo?: string | null; live_time_control?: string | null }[]).some((g) =>
    rowIndicatesLiveFreePlayPacing(g)
  );
}
