import { Chess, type Move } from 'chess.js';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** FEN strings longer than this are rejected before chess.js or engine transport. */
export const MAX_FEN_LENGTH = 256;

export type Side = 'w' | 'b';

export type ParsedPosition = {
  /** Whitespace-canonical six-field FEN for engine input. */
  engineFen: string;
  /** Legal-position identity: board, side, castling, en passant (no move counters). */
  positionKey: string;
  turn: Side;
  terminal: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  legalUciMoves: string[];
};

export class PositionParseError extends Error {
  readonly code = 'INVALID_FEN' as const;

  constructor(message = 'invalid_fen') {
    super(message);
    this.name = 'PositionParseError';
  }
}

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

function uciFromVerboseMove(move: Move): string {
  return `${move.from}${move.to}${(move.promotion ?? '').toLowerCase()}`.toLowerCase();
}

function legalPositionKeyFromEngineFen(engineFen: string): string {
  const parts = engineFen.split(' ');
  return [parts[0] ?? '', parts[1] ?? 'w', parts[2] ?? '-', parts[3] ?? '-'].join(' ');
}

/**
 * Parse and canonicalize a FEN. Rejects empty, oversized, control-character,
 * and illegal positions before any engine transport.
 */
export function parsePosition(fen: string): ParsedPosition {
  if (typeof fen !== 'string') {
    throw new PositionParseError('invalid_fen');
  }
  if (CONTROL_CHARS.test(fen)) {
    throw new PositionParseError('invalid_fen');
  }
  const trimmed = fen.trim();
  if (!trimmed) {
    throw new PositionParseError('invalid_fen');
  }
  if (trimmed.length > MAX_FEN_LENGTH) {
    throw new PositionParseError('invalid_fen');
  }

  const compact = trimmed.split(/\s+/).join(' ');
  if (compact.length > MAX_FEN_LENGTH) {
    throw new PositionParseError('invalid_fen');
  }

  let chess: Chess;
  try {
    chess = new Chess(compact);
  } catch {
    throw new PositionParseError('invalid_fen');
  }

  const engineFen = chess.fen();
  const fields = engineFen.split(' ');
  if (fields.length < 6) {
    throw new PositionParseError('invalid_fen');
  }

  const turn = chess.turn();
  const legal = chess.moves({ verbose: true }).map(uciFromVerboseMove);
  const isCheckmate = chess.isCheckmate();
  const isStalemate = chess.isStalemate();

  return {
    engineFen,
    positionKey: legalPositionKeyFromEngineFen(engineFen),
    turn,
    terminal: legal.length === 0,
    isCheckmate,
    isStalemate,
    legalUciMoves: legal,
  };
}

export function legalPositionKey(fen: string): string {
  return parsePosition(fen).positionKey;
}
