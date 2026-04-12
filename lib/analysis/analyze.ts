import { buildEngineRows, buildHeuristicRows } from './parser';
import type { StockfishWebAdapter } from './engine';
import type { AnalyzedMove } from './types';
import { Chess } from 'chess.js';

type EngineOutput = {
  best_move: string;
  candidate_moves: string[];
  confidence: number;
  depth: number;
};

export type AnalysisResult = {
  rows: AnalyzedMove[];
  engine?: EngineOutput;
};

function uciToSan(fen: string, uci: string): string | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(uci)) return null;
  const chess = new Chess(fen);
  const move = chess.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: (uci[4] as 'q' | 'r' | 'b' | 'n' | undefined) ?? undefined,
  });
  return move?.san ?? null;
}

export async function runHeuristicAnalysis(moves: { san: string }[]): Promise<AnalysisResult> {
  return { rows: buildHeuristicRows(moves) };
}

export async function runEngineAnalysis(params: {
  adapter: StockfishWebAdapter;
  fen: string;
  depth: number;
  multiPv: number;
  moves: { san: string }[];
}): Promise<AnalysisResult> {
  const evalResult = await params.adapter.evaluate(params.fen, params.depth, params.multiPv);
  const candidateMovesSan = evalResult.candidateMoves
    .map((uci) => uciToSan(params.fen, uci))
    .filter((san): san is string => Boolean(san));
  const bestMoveSan = uciToSan(params.fen, evalResult.bestMove);
  if (!bestMoveSan || candidateMovesSan.length === 0 || candidateMovesSan[0] !== bestMoveSan) {
    throw new Error('engine_unsanitizable_output');
  }

  return {
    rows: buildEngineRows(params.moves, params.depth, evalResult.score),
    engine: {
      best_move: bestMoveSan,
      candidate_moves: candidateMovesSan,
      confidence: evalResult.confidence,
      depth: evalResult.depth,
    },
  };
}
