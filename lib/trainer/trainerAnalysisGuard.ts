import type { SupabaseClient } from '@supabase/supabase-js';

export type TrainerGuardFailure = {
  ok: false;
  httpStatus: number;
  code: string;
  message: string;
};

export type TrainerGuardOk = { ok: true };

export type TrainerGuardResult = TrainerGuardOk | TrainerGuardFailure;

type GameRow = {
  id: string;
  status: string;
  mode: string | null;
  tournament_id: string | null;
  fen: string | null;
  white_player_id: string | null;
  black_player_id: string | null;
};

function normFen(f: string): string {
  return f.trim().replace(/\s+/g, ' ');
}

/**
 * Server-only: decides if trainer/engine analysis is allowed for a FEN (and optional game binding).
 */
export async function assertTrainerAnalysisAllowed(
  supabase: SupabaseClient,
  input: {
    fen: string;
    gameId: string | null;
    userId: string | null;
  }
): Promise<TrainerGuardResult> {
  const fen = normFen(input.fen);
  if (!fen) {
    return { ok: false, httpStatus: 400, code: 'INVALID_FEN', message: 'FEN is required.' };
  }

  if (input.gameId) {
    if (!input.userId) {
      return {
        ok: false,
        httpStatus: 401,
        code: 'AUTH_REQUIRED',
        message: 'Sign in to analyze positions from a saved game.',
      };
    }
    const { data, error } = await supabase
      .from('games')
      .select('id,status,mode,tournament_id,fen,white_player_id,black_player_id')
      .eq('id', input.gameId)
      .maybeSingle();
    if (error || !data) {
      return { ok: false, httpStatus: 404, code: 'GAME_NOT_FOUND', message: 'Game not found.' };
    }
    const g = data as GameRow;
    const uid = input.userId;
    const isParticipant = g.white_player_id === uid || g.black_player_id === uid;
    if (!isParticipant) {
      return { ok: false, httpStatus: 403, code: 'FORBIDDEN', message: 'Only participants can analyze this game.' };
    }
    const st = String(g.status ?? '').toLowerCase();
    if (st === 'active' || st === 'waiting') {
      if (g.tournament_id) {
        return {
          ok: false,
          httpStatus: 403,
          code: 'ACTIVE_TOURNAMENT',
          message: 'Analysis unavailable during active competitive games.',
        };
      }
      if (String(g.mode ?? '') === 'PIT') {
        return {
          ok: false,
          httpStatus: 403,
          code: 'ACTIVE_PIT',
          message: 'Analysis unavailable during active competitive games.',
        };
      }
      return {
        ok: false,
        httpStatus: 403,
        code: 'ACTIVE_GAME',
        message: 'Analysis unavailable during active competitive games.',
      };
    }
    if (st !== 'finished') {
      return {
        ok: false,
        httpStatus: 403,
        code: 'GAME_NOT_FINISHED',
        message: 'Analysis is only available after the game is finished.',
      };
    }
    return { ok: true };
  }

  // Sandbox (no gameId): block if this exact FEN matches an active tournament game position.
  const { data: hit } = await supabase
    .from('games')
    .select('id')
    .eq('status', 'active')
    .not('tournament_id', 'is', null)
    .eq('fen', fen)
    .limit(1)
    .maybeSingle();
  if (hit?.id) {
    return {
      ok: false,
      httpStatus: 403,
      code: 'FEN_ACTIVE_TOURNAMENT',
      message: 'Analysis temporarily unavailable for this position.',
    };
  }

  return { ok: true };
}
