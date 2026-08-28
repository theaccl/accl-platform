import { parsePosition, PositionParseError } from '@/lib/chess';

export class InvalidFenError extends Error {
  constructor(message = 'invalid_fen') {
    super(message);
    this.name = 'InvalidFenError';
  }
}

export function validateFenOrThrow(fen: string): void {
  try {
    parsePosition(fen);
  } catch (err) {
    if (err instanceof PositionParseError) {
      throw new InvalidFenError();
    }
    throw new InvalidFenError();
  }
}
