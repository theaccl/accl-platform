import type { ParsedPosition, Side } from '@/lib/chess/position';

export type EngineScore =
  | { kind: 'cp'; cp: number }
  | { kind: 'mate'; mate: number }
  | { kind: 'wdl'; win: number; draw: number; loss: number };

export type ScorePov = 'white' | 'mover';

export type EngineSearchLimits = {
  depth?: number;
  multiPv?: number;
  timeoutMs?: number;
};

export type EngineIdentity = {
  name: 'stockfish';
  version: string;
};

export type EngineBound = 'lower' | 'upper';

export type EngineLine = {
  rank: number;
  move: string;
  pv: string[];
  score: EngineScore;
  depth: number;
  bound: EngineBound | null;
};

export type EngineFailureCode =
  | 'INVALID_POSITION'
  | 'ENGINE_TIMEOUT'
  | 'ENGINE_CRASH'
  | 'MALFORMED_UCI'
  | 'PV_MISMATCH'
  | 'CONTRADICTORY_UCI';

export class EngineFailure extends Error {
  readonly code: EngineFailureCode;

  constructor(code: EngineFailureCode, message?: string) {
    super(message ?? code.toLowerCase());
    this.name = 'EngineFailure';
    this.code = code;
  }
}

export type EngineAnalysisResult = {
  identity: EngineIdentity;
  positionKey: string;
  engineFen: string;
  turn: Side;
  pov: 'white';
  terminal: boolean;
  bestMove: string | null;
  lines: EngineLine[];
  limits: {
    depth: number;
    multiPv: number;
    timeoutMs: number | null;
  };
};

export type EngineTransport = {
  send(command: string): void;
  subscribe(handlers: {
    onLine: (line: string) => void;
    onError?: (err: unknown) => void;
  }): () => void;
  close(): void;
};

export type EvaluatePositionInput = {
  transport: EngineTransport;
  position: ParsedPosition;
  limits?: EngineSearchLimits;
  identity?: EngineIdentity;
};
