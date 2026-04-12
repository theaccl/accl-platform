import type { SupabaseClient } from '@supabase/supabase-js';

/** Move row aligned with `game_move_logs` and public replay snapshot. */
export type FinishedGameAnalysisMoveLogRow = {
  san: string | null;
  fen_before: string | null;
  fen_after: string | null;
  created_at: string | null;
  from_sq: string | null;
  to_sq: string | null;
};

export type FinishedGameAnalysisPlayerRef = {
  id: string;
  username: string | null;
} | null;

/**
 * Canonical payload from `get_finished_game_analysis_intake`.
 * Returned only for rows with `games.status = 'finished'`; otherwise RPC yields null.
 */
export type FinishedGameAnalysisIntakePayload = {
  schema_version: string;
  game: {
    id: string;
    status: string;
    /** Normalized partition for pipelines: `free` | `tournament` | legacy fallthrough as stored. */
    analysis_partition: string;
    play_context: string | null;
    rated: boolean | null;
    tempo: string | null;
    live_time_control: string | null;
    source_type: string | null;
    tournament_id: string | null;
    mode: string | null;
    white_player_id: string;
    black_player_id: string | null;
    winner_id: string | null;
    result: string | null;
    end_reason: string | null;
    finished_at: string | null;
    created_at: string;
    final_fen: string | null;
    final_turn: string | null;
  };
  players: {
    white: FinishedGameAnalysisPlayerRef;
    black: FinishedGameAnalysisPlayerRef;
  };
  move_logs: FinishedGameAnalysisMoveLogRow[];
};

/**
 * Fetches the curated finished-game analysis intake snapshot.
 * `data` is null if the game is not finished or does not exist — never use for live/active boards.
 */
export async function fetchFinishedGameAnalysisIntake(
  supabase: SupabaseClient,
  gameId: string
): Promise<{ data: FinishedGameAnalysisIntakePayload | null; error: Error | null }> {
  const { data, error } = await supabase.rpc('get_finished_game_analysis_intake', { p_game_id: gameId });
  if (error) {
    return { data: null, error: new Error(error.message) };
  }
  if (data == null) {
    return { data: null, error: null };
  }
  return { data: data as FinishedGameAnalysisIntakePayload, error: null };
}
