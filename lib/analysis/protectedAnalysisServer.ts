import type { SupabaseClient } from '@supabase/supabase-js';

import { fetchFinishedGameAnalysisIntake } from '@/lib/finishedGameAnalysisIntake';
import { parsePosition } from '@/lib/chess';
import {
  getProtectedReviewRuntimeTruth,
} from '@/lib/analysis/protectedReviewRuntime.server';
import type { TruthPayload } from '@/lib/analysis/intelligence';

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
  signal?: AbortSignal;
  protectedReviewTruthProvider?: (input: {
    fen: string;
    mode: IntelligenceMode;
    moves: { san: string }[];
  }) => Promise<TruthPayload>;
}) {
  if (!input.gameId) {
    throw new ProtectedAnalysisPrecheckError(
      'gameId is required for protected analysis source-of-truth binding',
      400
    );
  }
  let game: GameContextRow | null = null;
  if (input.gameId) {
    const { data, error } = await input.serviceClient
      .from('games')
      .select('id,status,rated,tournament_id,fen,white_player_id,black_player_id')
      .eq('id', input.gameId)
      .maybeSingle();
    if (error) {
      throw new ProtectedAnalysisPrecheckError('Game lookup unavailable', 503);
    }
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
  let truthProvider:
    | ((arg: { fen: string; mode: IntelligenceMode }) => Promise<TruthPayload>)
    | undefined;

  if (status === 'finished') {
    const { data: intake, error } = await fetchFinishedGameAnalysisIntake(
      input.serviceClient,
      input.gameId
    );
    if (error) {
      throw new ProtectedAnalysisPrecheckError('Finished-game intake unavailable', 503);
    }
    if (
      !intake ||
      intake.schema_version !== 'fgi.1' ||
      intake.game.id !== game.id ||
      String(intake.game.status).toLowerCase() !== 'finished' ||
      intake.game.white_player_id !== game.white_player_id ||
      intake.game.black_player_id !== game.black_player_id
    ) {
      throw new ProtectedAnalysisPrecheckError('Finished-game intake failed closed', 503);
    }

    const canonicalFens = [
      intake.game.final_fen,
      ...intake.move_logs.flatMap((move) => [move.fen_before, move.fen_after]),
    ].filter((fen): fen is string => typeof fen === 'string' && fen.trim().length > 0);

    if (canonicalFens.length === 0) {
      throw new ProtectedAnalysisPrecheckError('Finished-game intake has no canonical position', 503);
    }

    let requestedPosition: ReturnType<typeof parsePosition>;
    let canonicalPosition: ReturnType<typeof parsePosition> | undefined;
    try {
      requestedPosition = parsePosition(input.fen);
    } catch {
      throw new ProtectedAnalysisPrecheckError('Invalid requested position', 400);
    }
    try {
      const positions = canonicalFens.map((fen) => parsePosition(fen));
      canonicalPosition = positions.find(
        (position) => position.positionKey === requestedPosition.positionKey
      );
    } catch {
      throw new ProtectedAnalysisPrecheckError('Finished-game intake contains an invalid position', 503);
    }
    if (!canonicalPosition) {
      throw new ProtectedAnalysisPrecheckError(
        'Blocked by integrity gate: position is not in the finished-game intake',
        403
      );
    }

    const moves = intake.move_logs.map((move) => {
      const san = typeof move.san === 'string' ? move.san.trim() : '';
      if (!san) {
        throw new ProtectedAnalysisPrecheckError('Finished-game intake contains an invalid move', 503);
      }
      return { san };
    });
    const provider =
      input.protectedReviewTruthProvider ??
      ((providerInput: { fen: string; mode: IntelligenceMode; moves: { san: string }[] }) =>
        getProtectedReviewRuntimeTruth({
          actorScope: `${input.userId}:${input.gameId}`,
          ...providerInput,
          signal: input.signal,
        }));
    truthProvider = ({ mode }) =>
      provider({ fen: canonicalPosition.engineFen, mode, moves });
  }

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
    truthProvider,
  });
}
