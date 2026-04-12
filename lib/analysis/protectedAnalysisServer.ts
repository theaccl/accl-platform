import type { SupabaseClient } from '@supabase/supabase-js';

import {
  getIntegrityControlledTruth,
  SupabaseAntiCheatEnforcementStore,
  SupabaseAntiCheatEventStore,
  type IntegrityContext,
  type IntelligenceMode,
  type OverlapInput,
  type ModeratorQueueSink,
} from '@/lib/analysis';

type GameContextRow = {
  id: string;
  status: string;
  rated: boolean | null;
  tournament_id: string | null;
  fen: string | null;
  white_player_id: string | null;
  black_player_id: string | null;
};

export class ProtectedAnalysisPrecheckError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'ProtectedAnalysisPrecheckError';
    this.status = status;
  }
}

export function resolveIntegrityContextFromGame(game: GameContextRow | null): IntegrityContext {
  if (!game) return { type: 'training-mode' };
  if (game.status === 'finished') return { type: 'completed-game-review' };
  if (game.tournament_id) return { type: 'active-tournament-game' };
  if (game.rated) return { type: 'active-rated-game' };
  return {
    type: 'active-unrated-free-play-game',
    liveHumanVsHuman:
      Boolean(game.white_player_id) &&
      Boolean(game.black_player_id) &&
      game.white_player_id !== game.black_player_id,
  };
}

export async function runProtectedAnalysisRequest(input: {
  serviceClient: SupabaseClient;
  userId: string;
  fen: string;
  mode: IntelligenceMode;
  gameId?: string | null;
  overlap?: OverlapInput;
  moderatorQueueSink?: ModeratorQueueSink;
}) {
  if (!input.gameId) {
    throw new ProtectedAnalysisPrecheckError(
      'gameId is required for protected analysis source-of-truth binding',
      400
    );
  }
  let game: GameContextRow | null = null;
  if (input.gameId) {
    const { data } = await input.serviceClient
      .from('games')
      .select('id,status,rated,tournament_id,fen,white_player_id,black_player_id')
      .eq('id', input.gameId)
      .maybeSingle();
    game = (data ?? null) as GameContextRow | null;
  }
  if (!game) {
    throw new ProtectedAnalysisPrecheckError('Game not found', 404);
  }
  const isParticipant = game.white_player_id === input.userId || game.black_player_id === input.userId;
  if (!isParticipant) {
    throw new ProtectedAnalysisPrecheckError('Forbidden for non-participant', 403);
  }
  const status = String(game.status ?? '').toLowerCase();
  if (game.tournament_id && status !== 'finished') {
    throw new ProtectedAnalysisPrecheckError(
      'Active tournament positions are protected and cannot be analyzed',
      403
    );
  }
  if (status !== 'finished' && String(game.fen ?? '').trim() !== input.fen.trim()) {
    throw new ProtectedAnalysisPrecheckError(
      'Blocked by integrity gate: non-canonical active position request',
      403
    );
  }
  const context = resolveIntegrityContextFromGame(game);
  const antiCheatStore = new SupabaseAntiCheatEventStore(input.serviceClient);
  const enforcementStore = new SupabaseAntiCheatEnforcementStore(input.serviceClient);
  return getIntegrityControlledTruth({
    fen: input.fen,
    mode: input.mode,
    context,
    overlap: input.overlap,
    userId: input.userId,
    gameId: input.gameId ?? null,
    antiCheatStore,
    enforcementStore,
    moderatorQueueSink: input.moderatorQueueSink,
  });
}
