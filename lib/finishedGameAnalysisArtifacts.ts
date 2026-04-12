import type { SupabaseClient } from '@supabase/supabase-js';

export type FinishedGameAnalysisArtifactRow = {
  id: string;
  job_id: string;
  game_id: string;
  artifact_type: string;
  artifact_version: string;
  analysis_partition: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

/**
 * Read-model for finished-game analysis artifacts.
 * Returns [] when the game is not in finished intake scope.
 */
export async function fetchLatestFinishedGameAnalysisArtifacts(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ data: FinishedGameAnalysisArtifactRow[]; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_latest_finished_game_analysis_artifacts', {
    p_game_id: gameId,
  });
  if (error) return { data: [], error: new Error(error.message) };
  return { data: ((data ?? []) as FinishedGameAnalysisArtifactRow[]) ?? [], error: null };
}

