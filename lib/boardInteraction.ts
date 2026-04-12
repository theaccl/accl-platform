import type { Chess } from 'chess.js';
import type { Square } from 'chess.js';

/**
 * Side to move from the current chess.js position (authoritative for legality, including check).
 */
export function sideToMoveFromBoard(board: Chess): 'white' | 'black' {
  return board.turn() === 'w' ? 'white' : 'black';
}

/**
 * Whether the local player may start a drag or click-to-move selection from `square`.
 * Uses chess.js move generation — must match `board` position used for rendering.
 */
export function canPickPieceForMove(
  board: Chess,
  square: string,
  myColor: 'white' | 'black'
): boolean {
  if (sideToMoveFromBoard(board) !== myColor) return false;
  const sq = square as Square;
  const piece = board.get(sq);
  if (!piece) return false;
  const pieceColor = piece.color === 'w' ? 'white' : 'black';
  if (pieceColor !== myColor) return false;
  return board.moves({ square: sq, verbose: true }).length > 0;
}
