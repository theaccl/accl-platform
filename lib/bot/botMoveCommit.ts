import { Chess } from 'chess.js';

import type { BotGameConfigV1 } from '@/lib/bot/botGameConfig';
import { parseBotGameConfigFromGameRow } from '@/lib/bot/botGameConfig';
import { botNameFromUserId } from '@/lib/bot/botIdentity';

export type BotMoveFailureCode =
  | 'bot_game_not_active'
  | 'bot_not_bot_game'
  | 'bot_turn_mismatch'
  | 'bot_seat_mismatch'
  | 'stale_bot_fen'
  | 'bot_move_invalid_uci'
  | 'bot_move_not_applied'
  | 'bot_no_candidates'
  | 'bot_config_missing';

export type BotMoveGuardFailure = {
  ok: false;
  code: BotMoveFailureCode;
  message: string;
};

export type BotMoveGuardSuccess = {
  ok: true;
  fenNow: string;
  sideToMoveUserId: string;
  botMoverColor: 'white' | 'black';
  botConfig: BotGameConfigV1;
};

export type GameRowForBotReply = {
  id?: string;
  fen?: string | null;
  turn?: string | null;
  status?: string | null;
  source_type?: string | null;
  white_player_id?: string | null;
  black_player_id?: string | null;
  bot_settings?: unknown;
  rating_last_update?: unknown;
};

export function isConfiguredBotPlayerId(userId: string): boolean {
  return botNameFromUserId(userId) != null;
}

export function terminalStateFromBoard(
  board: Chess,
  moverColor: 'white' | 'black',
): { result: string; endReason: string } | null {
  if (board.isCheckmate()) {
    return { result: moverColor === 'white' ? 'white_win' : 'black_win', endReason: 'checkmate' };
  }
  if (board.isStalemate()) {
    return { result: 'draw', endReason: 'stalemate' };
  }
  if (board.isThreefoldRepetition()) {
    return { result: 'draw', endReason: 'threefold_repetition' };
  }
  if (board.isInsufficientMaterial()) {
    return { result: 'draw', endReason: 'insufficient_material' };
  }
  if (board.isDrawByFiftyMoves()) {
    return { result: 'draw', endReason: 'fifty_move_rule' };
  }
  if (board.isDraw()) {
    return { result: 'draw', endReason: 'draw' };
  }
  return null;
}

export function sanitizeBotUciMove(move: string): string {
  const m = /^([a-h][1-8])([a-h][1-8])([qrbn]?)/i.exec(move.trim());
  if (!m) return '';
  return `${m[1]}${m[2]}${(m[3] ?? '').toLowerCase()}`;
}

/**
 * Preconditions for applying a bot reply after a committed human ply.
 */
export function verifyBotReplyPreconditions(
  row: GameRowForBotReply,
  opts: {
    humanPlayerId: string;
    expectedFen: string;
    botConfig: BotGameConfigV1 | null;
  },
): BotMoveGuardSuccess | BotMoveGuardFailure {
  if (String(row.source_type ?? '') !== 'bot_game') {
    return {
      ok: false,
      code: 'bot_not_bot_game',
      message: 'This game is not a computer game.',
    };
  }

  const status = String(row.status ?? '').trim().toLowerCase();
  if (status !== 'active') {
    return {
      ok: false,
      code: 'bot_game_not_active',
      message: 'Computer cannot move because the game is not active.',
    };
  }

  const fenNow = String(row.fen ?? '').trim();
  if (!fenNow) {
    return {
      ok: false,
      code: 'stale_bot_fen',
      message: 'Game position is missing.',
    };
  }

  if (opts.expectedFen && fenNow !== opts.expectedFen) {
    return {
      ok: false,
      code: 'stale_bot_fen',
      message: 'Game position changed before the computer could move.',
    };
  }

  if (!opts.botConfig) {
    return {
      ok: false,
      code: 'bot_config_missing',
      message: 'Computer opponent configuration is missing.',
    };
  }

  const turn = String(row.turn ?? '').trim().toLowerCase();
  if (turn !== 'white' && turn !== 'black') {
    return {
      ok: false,
      code: 'bot_turn_mismatch',
      message: 'It is not the computer’s turn.',
    };
  }

  const sideToMoveUserId =
    turn === 'white' ? String(row.white_player_id ?? '') : String(row.black_player_id ?? '');

  if (!sideToMoveUserId) {
    return {
      ok: false,
      code: 'bot_seat_mismatch',
      message: 'Computer seat is not configured.',
    };
  }

  if (sideToMoveUserId === opts.humanPlayerId) {
    return {
      ok: false,
      code: 'bot_turn_mismatch',
      message: 'It is not the computer’s turn.',
    };
  }

  if (!isConfiguredBotPlayerId(sideToMoveUserId)) {
    return {
      ok: false,
      code: 'bot_seat_mismatch',
      message: 'The side to move is not the configured computer opponent.',
    };
  }

  return {
    ok: true,
    fenNow,
    sideToMoveUserId,
    botMoverColor: turn,
    botConfig: opts.botConfig,
  };
}

export function parseBotConfigFromRows(
  primary: GameRowForBotReply,
  afterHuman: GameRowForBotReply,
): BotGameConfigV1 | null {
  return parseBotGameConfigFromGameRow(primary) ?? parseBotGameConfigFromGameRow(afterHuman);
}

export function applySanitizedUciToBoard(
  fen: string,
  uci: string,
): { board: Chess; moved: ReturnType<Chess['move']> } | null {
  const selectedUci = sanitizeBotUciMove(uci);
  if (!selectedUci) return null;
  let board: Chess;
  try {
    board = new Chess(fen);
  } catch {
    return null;
  }
  const moved = board.move({
    from: selectedUci.slice(0, 2),
    to: selectedUci.slice(2, 4),
    promotion: (selectedUci[4] as 'q' | 'r' | 'b' | 'n' | undefined) ?? undefined,
  });
  if (!moved) return null;
  return { board, moved };
}
