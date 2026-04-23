import type { SupabaseClient } from '@supabase/supabase-js';

/** Minimal row for accept-redirect priority (real `games.tempo` only). */
export type ActiveFreePlayGameRow = {
  id: string;
  tempo: string | null;
};

/**
 * Other free-play games the user is in as **active or waiting** (never finished).
 * Excludes `excludeGameId` so the game just created by accept is not treated as “current”.
 */
export async function getActiveFreePlayGameForUser(
  supabase: SupabaseClient,
  userId: string,
  excludeGameId?: string | null
): Promise<ActiveFreePlayGameRow | null> {
  const ex = excludeGameId?.trim();
  const { data, error } = await supabase
    .from('games')
    .select('id,tempo,updated_at')
    .eq('play_context', 'free')
    .is('tournament_id', null)
    .in('status', ['active', 'waiting'])
    .or(`white_player_id.eq.${userId},black_player_id.eq.${userId}`)
    .order('updated_at', { ascending: false })
    .limit(24);

  if (error || !data?.length) return null;

  const rows = (data as { id: string; tempo: string | null }[]).filter((g) => {
    const id = String(g.id ?? '').trim();
    if (!id) return false;
    if (ex && id === ex) return false;
    return true;
  });

  const first = rows[0];
  if (!first) return null;
  return { id: String(first.id), tempo: first.tempo ?? null };
}
