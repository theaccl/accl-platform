import { Chess } from 'chess.js';

/** Canonical starting FEN for DB rows and clients; avoid literal `'start'` (invalid for react-chessboard). */
export const START_FEN = new Chess().fen();
