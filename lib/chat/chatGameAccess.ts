import type { SupabaseClient } from '@supabase/supabase-js';

export type ViewerEcosystem = 'adult' | 'k12';

export type GameRowMinimal = {
  id: string;
  status: string;
  white_player_id: string;
  black_player_id: string | null;
  ecosystem_scope: string;
};

/**
 * Non-participant spectator access mirrors public spectate RPC (ecosystem + availability).
 * Participants bypass this check.
 */
export async function verifySpectatorGameView(
  supabase: SupabaseClient,
  gameId: string,
  viewerEcosystem: ViewerEcosystem
): Promise<boolean> {
  const { data, error } = await supabase.rpc('get_public_spectate_game_snapshot', {
    p_game_id: gameId,
    p_viewer_ecosystem: viewerEcosystem,
  });
  if (error) return false;
  return data != null;
}

export async function loadGameRow(
  supabase: SupabaseClient,
  gameId: string
): Promise<GameRowMinimal | null> {
  const { data, error } = await supabase
    .from('games')
    .select('id,status,white_player_id,black_player_id,ecosystem_scope')
    .eq('id', gameId)
    .maybeSingle();
  if (error || !data) return null;
  return data as GameRowMinimal;
}

export function ecosystemsCompatible(game: GameRowMinimal, viewer: ViewerEcosystem): boolean {
  const g = String(game.ecosystem_scope ?? 'adult').trim();
  return g === viewer;
}
