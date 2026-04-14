import type { SupabaseClient } from '@supabase/supabase-js';

export async function listMessagesForModerator(
  supabase: SupabaseClient,
  params: { limit: number; since?: string | null }
): Promise<Record<string, unknown>[]> {
  const lim = Math.min(500, Math.max(1, params.limit));
  let q = supabase
    .from('tester_chat_messages')
    .select('id,created_at,channel,game_id,lobby_room,dm_thread_id,sender_id,body');
  if (params.since) {
    q = q.gte('created_at', params.since);
  }
  const { data, error } = await q.order('created_at', { ascending: false }).limit(lim);
  if (error || !data) return [];
  return data as Record<string, unknown>[];
}
