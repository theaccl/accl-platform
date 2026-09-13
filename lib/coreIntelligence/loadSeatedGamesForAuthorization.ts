import type { SupabaseClient } from '@supabase/supabase-js';

import type { AuthoritativeGameSnapshot } from './types';

export const SEATED_AUTHORIZATION_GAME_SELECT =
  'id,status,tempo,play_context,mode,source_type,rated,tournament_id,bot_settings,white_player_id,black_player_id,updated_at' as const;

export type LoadSeatedGamesResult =
  | { ok: true; rows: AuthoritativeGameSnapshot[] }
  | { ok: false; reason: 'lookup_failed' | 'unauthenticated' };

type GameQueryRow = AuthoritativeGameSnapshot & { updated_at?: string | null };

/**
 * Load seated active/waiting `public.games` rows for the authenticated player.
 * Query failure is fail-closed. Empty result is "no in-play game", not unresolved.
 */
export async function loadSeatedAuthoritativeGamesForPlayer(
  client: SupabaseClient,
  authenticatedPlayerId: string,
): Promise<LoadSeatedGamesResult> {
  const uid = String(authenticatedPlayerId ?? '').trim();
  if (!uid) return { ok: false, reason: 'unauthenticated' };

  const { data, error } = await client
    .from('games')
    .select(SEATED_AUTHORIZATION_GAME_SELECT)
    .in('status', ['active', 'waiting'])
    .or(`white_player_id.eq.${uid},black_player_id.eq.${uid}`)
    .order('updated_at', { ascending: false })
    .limit(64);

  if (error) return { ok: false, reason: 'lookup_failed' };

  const rows: AuthoritativeGameSnapshot[] = [];
  for (const raw of (data ?? []) as GameQueryRow[]) {
    rows.push({
      id: String(raw.id ?? ''),
      status: raw.status ?? null,
      tempo: raw.tempo ?? null,
      play_context: raw.play_context ?? null,
      mode: raw.mode ?? null,
      source_type: raw.source_type ?? null,
      rated: raw.rated ?? null,
      tournament_id: raw.tournament_id ?? null,
      bot_settings: raw.bot_settings ?? null,
      white_player_id: raw.white_player_id ?? null,
      black_player_id: raw.black_player_id ?? null,
    });
  }
  return { ok: true, rows };
}
