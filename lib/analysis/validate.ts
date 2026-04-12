import { Chess } from 'chess.js';

export class InvalidFenError extends Error {
  constructor(message = 'invalid_fen') {
    super(message);
    this.name = 'InvalidFenError';
  }
}

export function validateFenOrThrow(fen: string): void {
  if (typeof fen !== 'string' || fen.trim().length === 0) {
    throw new InvalidFenError();
  }
  try {
    new Chess(fen);
  } catch {
    throw new InvalidFenError();
  }
}
