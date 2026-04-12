import type { SupabaseClient } from '@supabase/supabase-js';

export type FinishedGameAnalysisJobSummary = {
  game_id: string;
  never_queued: boolean;
  job: {
    id: string;
    status: 'queued' | 'running' | 'completed' | 'failed' | 'no_finished_intake';
    correlation_id: string | null;
    created_at: string;
    updated_at: string;
    intake_schema_version: string | null;
    analysis_partition: string | null;
    move_count: number | null;
    error_message: string | null;
  } | null;
  artifact_count: number;
  has_artifact: boolean;
  error?: string;
};

/**
 * Lightweight per-game analysis lifecycle summary for private finished-game surfaces.
 * Returns null when unavailable or forbidden.
 */
export async function fetchFinishedGameAnalysisJobSummary(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ data: FinishedGameAnalysisJobSummary | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_finished_game_analysis_job_summary', {
    p_game_id: gameId,
  });
  if (error) return { data: null, error: new Error(error.message) };
  if (!data || typeof data !== 'object') return { data: null, error: null };
  return { data: data as FinishedGameAnalysisJobSummary, error: null };
}
