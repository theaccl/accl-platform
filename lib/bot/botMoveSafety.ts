import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';

import type { BotCandidateLine } from '@/lib/bot/botPersonality';

const PIECE_VALUE_CP: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

const CENTER_SQUARES = new Set(['c4', 'd4', 'e4', 'f4', 'c5', 'd5', 'e5', 'f5']);

function opposite(color: Color): Color {
  return color === 'w' ? 'b' : 'w';
}

function materialFor(board: Chess, mover: Color): number {
  let score = 0;
  for (const row of board.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const value = PIECE_VALUE_CP[piece.type];
      score += piece.color === mover ? value : -value;
    }
  }
  return score;
}

function kingSquare(board: Chess, color: Color): Square | null {
  for (const row of board.board()) {
    for (const piece of row) {
      if (piece?.type === 'k' && piece.color === color) return piece.square;
    }
  }
  return null;
}

function applyUci(board: Chess, uci: string) {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  try {
    return board.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: (uci[4] as 'q' | 'r' | 'b' | 'n' | undefined) ?? undefined,
    });
  } catch {
    return null;
  }
}

/**
 * One-reply, deterministic safety evidence for engine-degraded selection and tests.
 * Engine evaluation remains authoritative whenever it is available.
 */
export function assessStaticBotMove(fen: string, move: string): BotCandidateLine | null {
  let board: Chess;
  try {
    board = new Chess(fen);
  } catch {
    return null;
  }

  const mover = board.turn();
  const opponent = opposite(mover);
  const beforeMaterial = materialFor(board, mover);
  const moved = applyUci(board, move);
  if (!moved) return null;

  const afterMaterial = materialFor(board, mover);
  const replies = board.moves({ verbose: true });
  let worstMaterial = afterMaterial;
  let allowsForcedMate = false;

  for (const reply of replies) {
    board.move(reply);
    worstMaterial = Math.min(worstMaterial, materialFor(board, mover));
    if (board.isCheckmate()) allowsForcedMate = true;
    board.undo();
  }

  const enemyKing = kingSquare(board, opponent);
  const movedTo = moved.to as Square;
  const movedPieceAttacked = board.isAttacked(movedTo, opponent);
  const movedPieceDefended = board.isAttacked(movedTo, mover);
  const developmentHomeRank = mover === 'w' ? '1' : '8';
  const development =
    (moved.piece === 'n' || moved.piece === 'b') &&
    moved.from.endsWith(developmentHomeRank) &&
    !moved.to.endsWith(developmentHomeRank);
  const check = moved.san.includes('+') || moved.san.includes('#');
  const mate = moved.san.includes('#');
  const capture = moved.flags.includes('c') || moved.flags.includes('e');
  const promotion = Boolean(moved.promotion);
  const materialDeltaAfterMoveCp = afterMaterial - beforeMaterial;
  const staticRiskCp = allowsForcedMate ? 100_000 : Math.max(0, beforeMaterial - worstMaterial);
  const heuristicScore =
    (capture ? 24 : 0) +
    (check ? 34 : 0) +
    (mate ? 10_000 : 0) +
    (promotion ? 50 : 0) +
    (development ? 18 : 0) +
    (CENTER_SQUARES.has(moved.to) ? 14 : 0) -
    (movedPieceAttacked && !movedPieceDefended ? Math.min(70, PIECE_VALUE_CP[moved.piece] / 8) : 0) -
    Math.min(100, staticRiskCp / 5);

  return {
    move,
    scoreCp: Math.round(heuristicScore),
    engineScoreCp: null,
    engineRank: null,
    lossFromBestCp: null,
    source: 'static-fallback',
    openingReference: false,
    staticRiskCp,
    allowsForcedMate,
    features: {
      capture,
      check,
      mate,
      promotion,
      development,
      centerControl: CENTER_SQUARES.has(moved.to),
      kingPressure: check || Boolean(enemyKing && board.isAttacked(enemyKing, mover)),
      movedPieceEnPrise: movedPieceAttacked && !movedPieceDefended,
      opponentReplyCount: replies.length,
      materialDeltaAfterMoveCp,
    },
  };
}

export function staticBotCandidates(fen: string, maxCandidates: number): BotCandidateLine[] {
  const board = new Chess(fen);
  const candidates = board
    .moves({ verbose: true })
    .map((move) => assessStaticBotMove(fen, `${move.from}${move.to}${move.promotion ?? ''}`.toLowerCase()))
    .filter((line): line is BotCandidateLine => Boolean(line))
    .sort((a, b) => {
      const safety = (a.staticRiskCp ?? 100_000) - (b.staticRiskCp ?? 100_000);
      if (safety !== 0) return safety;
      const score = (b.scoreCp ?? -100_000) - (a.scoreCp ?? -100_000);
      if (score !== 0) return score;
      return a.move.localeCompare(b.move);
    });
  return candidates.slice(0, maxCandidates);
}
