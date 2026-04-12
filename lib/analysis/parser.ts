import type { AnalyzedMove, HeuristicClassification } from './types';

export function buildHeuristicRows(moves: { san: string }[]): AnalyzedMove[] {
  return moves.map((m, idx) => ({
    index: idx,
    san: m.san,
    classification: 'good' as HeuristicClassification,
    analyzerType: 'heuristic',
  }));
}

export function buildEngineRows(
  moves: { san: string }[],
  depth: number,
  score = 0
): AnalyzedMove[] {
  return moves.map((m, idx) => ({
    index: idx,
    san: m.san,
    classification: 'good' as HeuristicClassification,
    engineScore: score,
    analyzerType: 'engine',
    depth,
  }));
}
