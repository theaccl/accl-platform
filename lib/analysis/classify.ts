import type { AnalyzedMove, HeuristicClassification } from './types';

function normalizeClassification(v: unknown): HeuristicClassification {
  if (v === 'best' || v === 'strong' || v === 'good' || v === 'inaccuracy' || v === 'mistake') {
    return v;
  }
  return 'blunder';
}

export function sanitizeAnalysisRows(rows: AnalyzedMove[], depth: number): AnalyzedMove[] {
  return rows.map((row, index) => ({
    index,
    san: typeof row.san === 'string' ? row.san : '',
    classification: normalizeClassification(row.classification),
    analyzerType: row.analyzerType === 'engine' ? 'engine' : 'heuristic',
    // Keep engine internals server-side; UI receives only classifications and SAN-level hints.
    engineScore: undefined,
    depth,
  }));
}
