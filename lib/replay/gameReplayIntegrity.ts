import { Chess } from 'chess.js';

export const STANDARD_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Piece placement + side to move + castling (ignores en-passant target and move counters). */
export function fenBoardKey(fen: string): string {
  const parts = String(fen ?? '').trim().split(/\s+/);
  if (parts.length < 3) return String(fen ?? '').trim();
  return parts.slice(0, 3).join(' ');
}

/** @deprecated alias — use fenBoardKey */
export function fenPositionKey(fen: string): string {
  return fenBoardKey(fen);
}

function fensEquivalent(a: string, b: string): boolean {
  return fenBoardKey(a) === fenBoardKey(b);
}

export type GameMoveLogReplayRow = {
  san: string | null;
  fen_before: string | null;
  fen_after: string | null;
  created_at?: string | null;
  from_sq?: string | null;
  to_sq?: string | null;
  player_id?: string | null;
};

export type ReplayIntegrityIssueCode =
  | 'no_logs'
  | 'missing_fen_after'
  | 'fen_chain_break'
  | 'replay_fen_mismatch'
  | 'duplicate_ply'
  | 'illegal_replay_move'
  | 'unexpected_log_count';

export type ReplayIntegritySuccess = {
  ok: true;
  replayedFen: string;
  plyCount: number;
  startFen: string;
};

export type ReplayIntegrityFailure = {
  ok: false;
  code: ReplayIntegrityIssueCode;
  message: string;
  plyIndex?: number;
  expectedFen?: string | null;
  actualFen?: string | null;
};

export type ReplayIntegrityResult = ReplayIntegritySuccess | ReplayIntegrityFailure;

function plySignature(log: GameMoveLogReplayRow): string {
  return [
    String(log.fen_before ?? ''),
    String(log.fen_after ?? ''),
    String(log.san ?? ''),
    String(log.from_sq ?? ''),
    String(log.to_sq ?? ''),
  ].join('|');
}

function applyLogMove(board: Chess, log: GameMoveLogReplayRow): boolean {
  const from = String(log.from_sq ?? '').trim().toLowerCase();
  const to = String(log.to_sq ?? '').trim().toLowerCase();
  if (/^[a-h][1-8]$/.test(from) && /^[a-h][1-8]$/.test(to)) {
    return Boolean(board.move({ from, to }));
  }
  const san = String(log.san ?? '').trim();
  if (!san) return false;
  try {
    return Boolean(board.move(san));
  } catch {
    return false;
  }
}

/**
 * Replays ordered move logs and compares the result to the canonical game FEN.
 */
export function verifyGameReplayIntegrity(input: {
  gameFinalFen: string | null;
  logs: GameMoveLogReplayRow[];
  startFen?: string;
  expectedLogCount?: number;
}): ReplayIntegrityResult {
  const logs = [...input.logs];
  const finalFen = String(input.gameFinalFen ?? '').trim();
  if (!finalFen) {
    return {
      ok: false,
      code: 'replay_fen_mismatch',
      message: 'Game final FEN is missing.',
      expectedFen: null,
      actualFen: null,
    };
  }

  if (typeof input.expectedLogCount === 'number' && logs.length !== input.expectedLogCount) {
    return {
      ok: false,
      code: 'unexpected_log_count',
      message: `Expected ${input.expectedLogCount} move logs but found ${logs.length}.`,
    };
  }

  if (logs.length === 0) {
    if (fensEquivalent(finalFen, input.startFen ?? STANDARD_START_FEN)) {
      return {
        ok: true,
        replayedFen: finalFen,
        plyCount: 0,
        startFen: input.startFen ?? STANDARD_START_FEN,
      };
    }
    return { ok: false, code: 'no_logs', message: 'No move logs to replay against a non-start position.' };
  }

  const seen = new Set<string>();
  for (let i = 0; i < logs.length; i++) {
    const sig = plySignature(logs[i]!);
    if (seen.has(sig)) {
      return {
        ok: false,
        code: 'duplicate_ply',
        message: 'Duplicate move log entry detected.',
        plyIndex: i,
      };
    }
    seen.add(sig);
  }

  const startFen =
    String(logs[0]?.fen_before ?? '').trim() ||
    String(input.startFen ?? '').trim() ||
    STANDARD_START_FEN;

  let board: Chess;
  try {
    board = new Chess(startFen);
  } catch {
    return {
      ok: false,
      code: 'fen_chain_break',
      message: 'Starting FEN for replay is invalid.',
      expectedFen: startFen,
    };
  }

  for (let i = 0; i < logs.length; i++) {
    const log = logs[i]!;
    const fenBefore = String(log.fen_before ?? '').trim();
    if (fenBefore && !fensEquivalent(board.fen(), fenBefore)) {
      return {
        ok: false,
        code: 'fen_chain_break',
        message: 'Move log chain does not match replayed position.',
        plyIndex: i,
        expectedFen: fenBefore,
        actualFen: board.fen(),
      };
    }

    if (!applyLogMove(board, log)) {
      return {
        ok: false,
        code: 'illegal_replay_move',
        message: 'Could not replay a logged move.',
        plyIndex: i,
      };
    }

    const fenAfter = String(log.fen_after ?? '').trim();
    if (!fenAfter) {
      return {
        ok: false,
        code: 'missing_fen_after',
        message: 'Move log is missing fen_after.',
        plyIndex: i,
      };
    }
    if (!fensEquivalent(board.fen(), fenAfter)) {
      return {
        ok: false,
        code: 'fen_chain_break',
        message: 'Logged fen_after does not match replayed board.',
        plyIndex: i,
        expectedFen: fenAfter,
        actualFen: board.fen(),
      };
    }
  }

  const replayedFen = board.fen();
  if (!fensEquivalent(replayedFen, finalFen)) {
    return {
      ok: false,
      code: 'replay_fen_mismatch',
      message: 'Replayed FEN does not match game row FEN.',
      expectedFen: finalFen,
      actualFen: replayedFen,
    };
  }

  return {
    ok: true,
    replayedFen,
    plyCount: logs.length,
    startFen,
  };
}

/**
 * Lightweight post-commit warning when logs exist but do not match game FEN.
 */
export function replayIntegrityWarning(
  gameFinalFen: string | null,
  logs: GameMoveLogReplayRow[],
): ReplayIntegrityFailure | null {
  const result = verifyGameReplayIntegrity({ gameFinalFen, logs });
  return result.ok ? null : result;
}
