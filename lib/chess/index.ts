export {
  parsePosition,
  legalPositionKey,
  PositionParseError,
  START_FEN,
  MAX_FEN_LENGTH,
} from '@/lib/chess/position';
export type { ParsedPosition, Side } from '@/lib/chess/position';

export { toWhitePov, toMoverPov, moverPovCentipawn, whitePovCentipawn } from '@/lib/chess/engine/score';

export { EngineFailure } from '@/lib/chess/engine/types';
export type {
  EngineScore,
  ScorePov,
  EngineSearchLimits,
  EngineIdentity,
  EngineLine,
  EngineAnalysisResult,
  EngineTransport,
  EngineFailureCode,
  EvaluatePositionInput,
} from '@/lib/chess/engine/types';

export {
  evaluatePositionWithStockfish,
  DEFAULT_STOCKFISH_IDENTITY,
} from '@/lib/chess/engine/stockfishAdapter';

export { parseUciInfoLine, parseUciTranscript, UCI_MOVE_PATTERN } from '@/lib/chess/engine/uci';
export type { ParsedUciInfo, ParsedUciTranscript, ParseUciTranscriptOptions } from '@/lib/chess/engine/uci';

export {
  CHESS_ANALYSIS_SCHEMA_VERSION,
  chessAnalysisSchema,
  parseChessAnalysis,
  safeParseChessAnalysis,
  chessAnalysisFromEngineResult,
} from '@/lib/chess/analysisSchema';
export type { ChessAnalysis, ChessAnalysisScore } from '@/lib/chess/analysisSchema';
