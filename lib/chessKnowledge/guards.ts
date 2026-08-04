import type { SupabaseClient } from '@supabase/supabase-js';

import { fetchFinishedGameAnalysisIntake } from '@/lib/finishedGameAnalysisIntake';

export type ChessKnowledgeGuardFailure = {
  ok: false;
  code: string;
  message: string;
};

export type ChessKnowledgeGuardOk = { ok: true };

export type ChessKnowledgeGuardResult = ChessKnowledgeGuardOk | ChessKnowledgeGuardFailure;

const ACTIVE_STATUSES = new Set(['active', 'waiting']);

/**
 * Finished-only gate for repertoire, opening match, tactic extraction, and mentor payloads.
 * Prefer `get_finished_game_analysis_intake` as the canonical DB boundary.
 */
export async function assertFinishedGameKnowledgeIntake(
  supabase: SupabaseClient,
  gameId: string
): Promise<ChessKnowledgeGuardResult & { intakeAvailable?: boolean }> {
  if (!gameId?.trim()) {
    return { ok: false, code: 'GAME_ID_REQUIRED', message: 'Game id is required.' };
  }

  const { data, error } = await fetchFinishedGameAnalysisIntake(supabase, gameId);
  if (error) {
    return { ok: false, code: 'INTAKE_ERROR', message: error.message };
  }
  if (!data) {
    return {
      ok: false,
      code: 'NOT_FINISHED',
      message: 'Chess knowledge intake requires a finished game.',
      intakeAvailable: false,
    };
  }
  return { ok: true, intakeAvailable: true };
}

/**
 * Blocks active tournament (and active competitive) games from trainer / encyclopedia pipelines.
 */
export function assertNoActiveTournamentKnowledgeUse(input: {
  status: string;
  tournamentId: string | null;
  mode: string | null;
}): ChessKnowledgeGuardResult {
  const st = String(input.status ?? '').toLowerCase();
  if (!ACTIVE_STATUSES.has(st)) {
    return { ok: true };
  }
  if (input.tournamentId) {
    return {
      ok: false,
      code: 'ACTIVE_TOURNAMENT',
      message: 'Tournament-active games cannot enter Trainer or encyclopedia intake.',
    };
  }
  if (String(input.mode ?? '') === 'PIT') {
    return {
      ok: false,
      code: 'ACTIVE_PIT',
      message: 'Active competitive games cannot enter Trainer or encyclopedia intake.',
    };
  }
  return {
    ok: false,
    code: 'ACTIVE_GAME',
    message: 'Active games cannot enter finished-only chess knowledge intake.',
  };
}
