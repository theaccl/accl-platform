import { Chess } from 'chess.js';

import { evaluateTrainerPositionUci } from '@/lib/analysis/engineComputeService';
import type { BotDifficultyProfile } from '@/lib/bot/botDifficulty';
import { assessStaticBotMove, staticBotCandidates } from '@/lib/bot/botMoveSafety';
import { botOpeningReferenceMoves } from '@/lib/bot/botOpeningBook';
import type { BotCandidateLine } from '@/lib/bot/botPersonality';
import type { BotPersonalityStyle } from '@/lib/bot/botPersonalityStyle';

const PIECE_VALUE_CP = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
} as const;

/** Legal UCI from chess.js verbose move (never append bogus capture suffixes). */
export function uciFromVerboseMove(mv: { from: string; to: string; promotion?: string }): string {
  return `${mv.from}${mv.to}${(mv.promotion ?? '').toLowerCase()}`.toLowerCase();
}

type EngineResult = Awaited<ReturnType<typeof evaluateTrainerPositionUci>>;

export type BotCandidateBuildOptions = {
  allowOpeningReference?: boolean;
  personalityStyle?: BotPersonalityStyle;
  evaluatePosition?: (
    fen: string,
    options: { depth: number; multiPv: number; timeoutMs: number },
  ) => Promise<EngineResult>;
  onEngineFailure?: (error: unknown) => void;
};

export function shouldAuditBotEngineDegradation(
  profile: Pick<BotDifficultyProfile, 'useEngine'>,
  rationale: string,
): boolean {
  return profile.useEngine && rationale.startsWith('static-fallback:');
}

function withOpeningReference(
  fen: string,
  lines: BotCandidateLine[],
  options?: BotCandidateBuildOptions,
): BotCandidateLine[] {
  if (!options?.allowOpeningReference || !options.personalityStyle) return lines;
  const openingMoves = new Set(botOpeningReferenceMoves(fen, options.personalityStyle));
  return lines.map((line) => ({
    ...line,
    openingReference: openingMoves.has(line.move),
  }));
}

function engineCandidates(fen: string, result: EngineResult): BotCandidateLine[] {
  const byMove = new Map<string, BotCandidateLine>();
  for (const line of result.lines) {
    const staticEvidence = assessStaticBotMove(fen, line.move);
    if (!staticEvidence) continue;
    byMove.set(line.move, {
      ...staticEvidence,
      scoreCp: line.scoreCp,
      engineScoreCp: line.scoreCp,
      engineRank: line.rank,
      enginePv: line.pv ?? [line.move],
      planEvidence: enginePlanEvidence(fen, line.pv ?? [line.move]),
      source: 'engine',
    });
  }

  if (result.bestMove && !byMove.has(result.bestMove)) {
    const staticEvidence = assessStaticBotMove(fen, result.bestMove);
    if (staticEvidence) {
      byMove.set(result.bestMove, {
        ...staticEvidence,
        scoreCp: null,
        engineScoreCp: null,
        engineRank: 1,
        source: 'engine',
      });
    }
  }

  return [...byMove.values()].sort((a, b) => {
    const rank = (a.engineRank ?? 999) - (b.engineRank ?? 999);
    if (rank !== 0) return rank;
    return a.move.localeCompare(b.move);
  });
}

function materialForMover(board: Chess, mover: 'w' | 'b'): number {
  let score = 0;
  for (const row of board.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const value = PIECE_VALUE_CP[piece.type];
      score += piece.color === mover ? value : -value;
    }
  }
  return score;
}

function applyUci(board: Chess, uci: string) {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  try {
    return board.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: (uci[4] as 'q' | 'r' | 'b' | 'n' | undefined) ?? undefined,
    });
  } catch {
    return null;
  }
}

function enginePlanEvidence(fen: string, pv: readonly string[]): NonNullable<BotCandidateLine['planEvidence']> {
  const board = new Chess(fen);
  const mover = board.turn();
  const materialBefore = materialForMover(board, mover);
  const rootEvidence = pv[0] ? assessStaticBotMove(fen, pv[0]) : null;
  let observedPlies = 0;
  let continuationEvidence: BotCandidateLine | null = null;

  for (let index = 0; index < Math.min(3, pv.length); index += 1) {
    if (index === 2) continuationEvidence = assessStaticBotMove(board.fen(), pv[index]!);
    if (!applyUci(board, pv[index]!)) break;
    observedPlies += 1;
  }

  const materialDeltaAfterPvCp =
    observedPlies >= 3 ? materialForMover(board, mover) - materialBefore : null;
  const rootFeatures = rootEvidence?.features;
  const continuationFeatures = continuationEvidence?.features;
  const initiativeReasons = [
    rootFeatures?.development &&
    (continuationFeatures?.development || continuationFeatures?.centerControl || continuationFeatures?.kingPressure)
      ? 'development-continued'
      : null,
    rootFeatures?.centerControl &&
    (continuationFeatures?.development || continuationFeatures?.centerControl || continuationFeatures?.kingPressure)
      ? 'control-continued'
      : null,
    rootFeatures?.kingPressure && continuationFeatures?.kingPressure
      ? 'king-pressure-sustained'
      : null,
  ].filter((reason): reason is string => Boolean(reason));

  return {
    opponentReply: observedPlies >= 2 ? pv[1] ?? null : null,
    continuation: observedPlies >= 3 ? pv[2] ?? null : null,
    observedPlies,
    materialDeltaAfterPvCp,
    concreteCompensation:
      materialDeltaAfterPvCp !== null && materialDeltaAfterPvCp >= 100,
    sustainedInitiative: initiativeReasons.length > 0,
    initiativeReasons,
  };
}

export async function buildBotCandidatesFromFen(
  fen: string,
  profile: BotDifficultyProfile,
  options?: BotCandidateBuildOptions,
): Promise<BotCandidateLine[]> {
  // Validate before starting an engine process or constructing fallback evidence.
  new Chess(fen);
  const fallback = staticBotCandidates(fen, profile.maxCandidates);
  if (!profile.useEngine) return withOpeningReference(fen, fallback, options);

  const evaluatePosition = options?.evaluatePosition ?? evaluateTrainerPositionUci;
  try {
    const result = await evaluatePosition(fen, {
      depth: profile.engineDepth,
      multiPv: profile.engineMultiPv,
      timeoutMs: profile.engineTimeoutMs,
    });
    const engine = engineCandidates(fen, result);
    if (engine.length > 0) return withOpeningReference(fen, engine, options);
  } catch (error) {
    options?.onEngineFailure?.(error);
    // Degrade to the deterministic static safety pass. The selector rationale and
    // server audit distinguish this path from an engine-backed decision.
  }
  return withOpeningReference(fen, fallback, options);
}
