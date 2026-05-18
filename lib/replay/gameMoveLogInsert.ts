import type { SupabaseClient } from '@supabase/supabase-js';

export type GameMoveLogInsertRow = {
  game_id: string;
  player_id: string;
  san: string;
  from_sq: string;
  to_sq: string;
  fen_before: string | null;
  fen_after: string;
  move_duration_ms: number | null;
};

export type MoveLogInsertContext = 'human' | 'bot' | 'legacy_ops' | 'diagnostic';

export type MoveLogInsertFailureCode =
  | 'human_move_log_failed'
  | 'bot_move_log_failed'
  | 'move_log_insert_failed';

export type MoveLogInsertResult =
  | { ok: true }
  | {
      ok: false;
      code: MoveLogInsertFailureCode;
      message: string;
      dbError: string | null;
      context: MoveLogInsertContext;
    };

function failureCodeForContext(context: MoveLogInsertContext): MoveLogInsertFailureCode {
  if (context === 'human') return 'human_move_log_failed';
  if (context === 'bot') return 'bot_move_log_failed';
  return 'move_log_insert_failed';
}

/**
 * Service-role insert into `game_move_logs`.
 * Production submit-move uses `p_move_log` on `apply_move_and_maybe_finish_system` (Phase 1D).
 * This helper remains for legacy ops routes and diagnostics only.
 */
export async function insertGameMoveLog(
  supabase: SupabaseClient,
  row: GameMoveLogInsertRow,
  context: MoveLogInsertContext,
): Promise<MoveLogInsertResult> {
  const { error } = await supabase.from('game_move_logs').insert(row);
  if (!error) {
    return { ok: true };
  }
  const dbError = String(error.message ?? 'unknown').trim() || 'unknown';
  return {
    ok: false,
    code: failureCodeForContext(context),
    message:
      context === 'human'
        ? 'Your move was saved but the move history log could not be written. Refresh and contact support if this persists.'
        : context === 'bot'
          ? 'The computer move was saved but the move history log could not be written. Refresh and contact support if this persists.'
          : 'Move history log could not be written.',
    dbError,
    context,
  };
}
