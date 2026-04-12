export type HeuristicClassification =
  | 'best'
  | 'strong'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder';

export type AnalyzedMove = {
  index: number;
  san: string;
  classification: HeuristicClassification;
  engineScore?: number | null;
  analyzerType?: 'heuristic' | 'engine';
  depth?: number;
};
