import type { SupabaseClient } from '@supabase/supabase-js';
import { Chess } from 'chess.js';

import { fetchFinishedGameAnalysisIntake } from '@/lib/finishedGameAnalysisIntake';
import { parsePosition, START_FEN } from '@/lib/chess';
import {
  getProtectedReviewRuntimeTruth,
} from '@/lib/analysis/protectedReviewRuntime.server';
import type { TruthPayload } from '@/lib/analysis/intelligence';

import {
  evaluateOverlap,
  getIntegrityControlledTruth,
  IntegrityControlUnavailableError,
  SupabaseAntiCheatEnforcementStore,
  SupabaseAntiCheatEventStore,
  type AntiCheatEnforcementStore,
  type AntiCheatEventStore,
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

type ActiveGameOverlapRow = GameContextRow & {
  source_type: string | null;
};

type ActiveGameMoveRow = {
  id: string;
  game_id: string;
  san: string | null;
  fen_before: string | null;
  fen_after: string | null;
  created_at: string | null;
};

const MAX_ACTIVE_GAMES = 64;
const MAX_ACTIVE_GAME_MOVES = 1_024;

function requireCompleteRows<T>(data: T[] | null, count: number | null, maximum: number): T[] {
  if (
    !Array.isArray(data) || !Number.isSafeInteger(count) || count === null ||
    count < 0 || count > maximum || count !== data.length
  ) {
    throw new IntegrityControlUnavailableError('ANTI_CHEAT_EVIDENCE_INVALID');
  }
  return data;
}

export type ProtectedAnalysisOverlapProvider = (input: {
  serviceClient: SupabaseClient;
  userId: string;
  requestFen: string;
  requestMoves: string[];
}) => Promise<OverlapInput>;

export async function deriveProtectedAnalysisOverlap(input: {
  serviceClient: SupabaseClient;
  userId: string;
  requestFen: string;
  requestMoves: string[];
}): Promise<OverlapInput> {
  const { data: activeRows, count: activeCount, error: activeError } = await input.serviceClient
    .from('games')
    .select(
      'id,status,rated,tournament_id,fen,white_player_id,black_player_id,source_type',
      { count: 'exact' }
    )
    .eq('status', 'active')
    .or(`white_player_id.eq.${input.userId},black_player_id.eq.${input.userId}`)
    .order('id', { ascending: true })
    .limit(MAX_ACTIVE_GAMES);
  if (activeError) {
    throw new IntegrityControlUnavailableError('ANTI_CHEAT_HISTORY_UNAVAILABLE');
  }

  const completeGames = requireCompleteRows(activeRows as ActiveGameOverlapRow[] | null, activeCount, MAX_ACTIVE_GAMES);
  const seenGames = new Set<string>();
  for (const game of completeGames) {
    if (
      !game || !game.id || seenGames.has(game.id) || game.status !== 'active' ||
      (game.white_player_id !== input.userId && game.black_player_id !== input.userId)
    ) throw new IntegrityControlUnavailableError('ANTI_CHEAT_EVIDENCE_INVALID');
    seenGames.add(game.id);
  }
  const activeGames = completeGames.filter(
    (game) =>
      game.source_type !== 'bot_game' &&
      Boolean(game.white_player_id) &&
      Boolean(game.black_player_id) &&
      game.white_player_id !== game.black_player_id
  );
  if (activeGames.length === 0) return { requestMoves: input.requestMoves };

  const ids = activeGames.map((game) => game.id);
  const { data: moveRows, count: moveCount, error: moveError } = await input.serviceClient
    .from('game_move_logs')
    .select('id,game_id,san,fen_before,fen_after,created_at', { count: 'exact' })
    .in('game_id', ids)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(MAX_ACTIVE_GAME_MOVES * ids.length);
  if (moveError) {
    throw new IntegrityControlUnavailableError('ANTI_CHEAT_HISTORY_UNAVAILABLE');
  }

  const movesByGame = new Map<string, ActiveGameMoveRow[]>();
  const completeMoves = requireCompleteRows(moveRows as ActiveGameMoveRow[] | null, moveCount, MAX_ACTIVE_GAME_MOVES * ids.length);
  const seenMoves = new Set<string>();
  for (const row of completeMoves) {
    if (!row) throw new IntegrityControlUnavailableError('ANTI_CHEAT_EVIDENCE_INVALID');
    const san = typeof row.san === 'string' ? row.san.trim() : '';
    if (!row.id || seenMoves.has(row.id) || !ids.includes(row.game_id) || !san || san.length > 64 ||
      typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))) {
      throw new IntegrityControlUnavailableError('ANTI_CHEAT_EVIDENCE_INVALID');
    }
    seenMoves.add(row.id);
    const moves = movesByGame.get(row.game_id) ?? [];
    if (moves.length >= MAX_ACTIVE_GAME_MOVES) {
      throw new IntegrityControlUnavailableError('ANTI_CHEAT_EVIDENCE_INVALID');
    }
    moves.push({ ...row, san });
    movesByGame.set(row.game_id, moves);
  }

  let selected: { evidence: OverlapInput; score: number } | null = null;
  for (const game of activeGames) {
    let activePosition: ReturnType<typeof parsePosition>;
    const logs = movesByGame.get(game.id) ?? [];
    const canonicalMoves: string[] = [];
    try {
      activePosition = parsePosition(game.fen!);
      // A complete standard game must replay from the shared starting position.
      // Compare full canonical FENs so repetitions cannot conceal missing plies.
      const board = new Chess(START_FEN);
      for (const log of logs) {
        if (parsePosition(log.fen_before!).engineFen !== board.fen()) throw new Error('history_gap');
        canonicalMoves.push(board.move(log.san!).san);
        if (parsePosition(log.fen_after!).engineFen !== board.fen()) throw new Error('history_mismatch');
      }
      if (board.fen() !== activePosition.engineFen) throw new Error('incomplete_history');
    } catch {
      throw new IntegrityControlUnavailableError('ANTI_CHEAT_EVIDENCE_INVALID');
    }
    const evidence: OverlapInput = {
      activeGameFen: activePosition.engineFen,
      activeGameMoves: canonicalMoves,
      requestMoves: input.requestMoves,
    };
    const evaluation = evaluateOverlap({
      requestFen: input.requestFen,
      context: { type: 'completed-game-review' },
      overlap: evidence,
      protectActiveGameOverlap: true,
    });
    const verdictRank = {
      CLEAR: 0,
      BOOK_OVERLAP: 1,
      NOVELTY_COLLISION: 2,
      CONFIRMED_OVERLAP: 3,
    }[evaluation.verdict];
    const score = (evaluation.blockedByOverlap ? 1_000_000 : 0) +
      verdictRank * 10_000 + evaluation.matchSummary.matchedPrefixPlies;
    if (!selected || score > selected.score) selected = { evidence, score };
  }
  return selected?.evidence ?? { requestMoves: input.requestMoves };
}

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
  moderatorQueueSink?: ModeratorQueueSink;
  antiCheatStore?: AntiCheatEventStore;
  enforcementStore?: AntiCheatEnforcementStore;
  protectedAnalysisOverlapProvider?: ProtectedAnalysisOverlapProvider;
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
  const antiCheatStore = input.antiCheatStore ?? new SupabaseAntiCheatEventStore(input.serviceClient);
  const enforcementStore =
    input.enforcementStore ?? new SupabaseAntiCheatEnforcementStore(input.serviceClient);
  let activeGameFen: string | undefined;
  if (typeof game.fen === 'string') {
    try {
      activeGameFen = parsePosition(game.fen).engineFen;
    } catch {
      throw new ProtectedAnalysisPrecheckError('Canonical game position is invalid', 503);
    }
  }
  let serverOverlap: OverlapInput = {
    activeGameFen,
    activeGameMoves: [],
    requestMoves: [],
  };
  let truthProvider:
    | ((arg: { fen: string; mode: IntelligenceMode }) => Promise<TruthPayload>)
    | undefined;
  let analysisFen = input.fen;

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

    let requestedPosition: ReturnType<typeof parsePosition>;
    let canonicalPosition: ReturnType<typeof parsePosition> | undefined;
    const moves: { san: string }[] = [];
    try {
      requestedPosition = parsePosition(input.fen);
    } catch {
      throw new ProtectedAnalysisPrecheckError('Invalid requested position', 400);
    }
    try {
      if (!Array.isArray(intake.move_logs) || intake.move_logs.length > MAX_ACTIVE_GAME_MOVES) {
        throw new Error('invalid_finished_history');
      }
      // Participants can append move-log rows. A stored FEN is not authority:
      // reconstruct the entire chain and anchor it to the server-owned final board.
      const board = new Chess(START_FEN);
      const positions = [parsePosition(board.fen())];
      for (const move of intake.move_logs) {
        if (!move || typeof move.san !== 'string' || !move.san.trim() || move.san.length > 64) {
          throw new Error('invalid_finished_move');
        }
        if (parsePosition(move.fen_before!).engineFen !== board.fen()) {
          throw new Error('finished_history_gap');
        }
        moves.push({ san: board.move(move.san.trim()).san });
        const after = parsePosition(board.fen());
        if (parsePosition(move.fen_after!).engineFen !== after.engineFen) {
          throw new Error('finished_history_mismatch');
        }
        positions.push(after);
      }
      // Full counters matter: an appended legal cycle must not pass by returning
      // to the same board position. Also detect incomplete/truncated intake.
      if (board.fen() !== activeGameFen || board.fen() !== parsePosition(intake.game.final_fen!).engineFen) {
        throw new Error('finished_final_mismatch');
      }
      canonicalPosition = positions.find(
        (position) => position.positionKey === requestedPosition.positionKey
      );
    } catch {
      throw new ProtectedAnalysisPrecheckError('Finished-game intake contains invalid or incomplete history', 503);
    }
    if (!canonicalPosition) {
      throw new ProtectedAnalysisPrecheckError(
        'Blocked by integrity gate: position is not in the finished-game intake',
        403
      );
    }
    analysisFen = canonicalPosition.engineFen;

    serverOverlap = await (
      input.protectedAnalysisOverlapProvider ?? deriveProtectedAnalysisOverlap
    )({
      serviceClient: input.serviceClient,
      userId: input.userId,
      requestFen: canonicalPosition.engineFen,
      requestMoves: moves.map((move) => move.san),
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
    fen: analysisFen,
    mode: input.mode,
    context,
    overlap: serverOverlap,
    userId: input.userId,
    gameId: input.gameId ?? null,
    antiCheatStore,
    enforcementStore,
    moderatorQueueSink: input.moderatorQueueSink,
    requireDurableControls: true,
    truthProvider,
  });
}
