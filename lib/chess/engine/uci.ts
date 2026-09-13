import { EngineFailure, type EngineBound, type EngineScore } from '@/lib/chess/engine/types';
import { isLegalUciPv, parsePosition } from '@/lib/chess/position';

export const UCI_MOVE_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/i;

export type ParsedUciInfo = {
  rank: number;
  depth: number;
  pv: string[];
  score: EngineScore;
  bound: EngineBound | null;
};

export type ParsedUciTranscript = {
  bestMove: string | null;
  lines: ParsedUciInfo[];
};

function isUciMove(token: string): boolean {
  return UCI_MOVE_PATTERN.test(token);
}

function parseSignedInt(raw: string | undefined): number | null {
  if (raw == null || raw === '') return null;
  if (!/^-?\d+$/.test(raw)) return null;
  const n = Number(raw);
  if (!Number.isSafeInteger(n)) return null;
  return n;
}

/**
 * Parse a single UCI `info` line. Returns null for incomplete status lines
 * (nodes, currmove, etc.). Lines that claim MultiPV+PV but cannot be parsed
 * must be treated as malformed by the caller.
 */
export function parseUciInfoLine(line: string): ParsedUciInfo | null {
  const trimmed = line.trim();
  if (!trimmed.toLowerCase().startsWith('info ')) return null;

  const tokens = trimmed.split(/\s+/);
  let rank: number | null = null;
  let depth = 0;
  let cp: number | null = null;
  let mate: number | null = null;
  let bound: EngineBound | null = null;
  let pv: string[] | null = null;
  let sawScore = false;
  let sawPv = false;

  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i]?.toLowerCase();
    if (token === 'depth') {
      const value = parseSignedInt(tokens[i + 1]);
      if (value == null || value < 0) return null;
      depth = value;
      i += 1;
      continue;
    }
    if (token === 'multipv') {
      const value = parseSignedInt(tokens[i + 1]);
      if (value == null || value < 1) return null;
      rank = value;
      i += 1;
      continue;
    }
    if (token === 'score') {
      const unit = tokens[i + 1]?.toLowerCase();
      const value = parseSignedInt(tokens[i + 2]);
      if (unit === 'cp') {
        if (value == null) return null;
        if (sawScore && mate !== null) return null;
        cp = value;
        sawScore = true;
        i += 2;
      } else if (unit === 'mate') {
        if (value == null) return null;
        if (sawScore && cp !== null) return null;
        mate = value;
        sawScore = true;
        i += 2;
      } else {
        return null;
      }
      const maybeBound = tokens[i + 1]?.toLowerCase();
      if (maybeBound === 'lowerbound') {
        bound = 'lower';
        i += 1;
      } else if (maybeBound === 'upperbound') {
        bound = 'upper';
        i += 1;
      }
      continue;
    }
    if (token === 'pv') {
      sawPv = true;
      const rest = tokens.slice(i + 1);
      if (rest.length === 0) return null;
      if (!rest.every(isUciMove)) return null;
      pv = rest.map((move) => move.toLowerCase());
      break;
    }
  }

  if (!sawPv || !sawScore || !pv || pv.length === 0) {
    return null;
  }
  if (cp !== null && mate !== null) {
    return null;
  }

  const score: EngineScore | null =
    mate !== null ? { kind: 'mate', mate } : cp !== null ? { kind: 'cp', cp } : null;
  if (!score) return null;

  return {
    rank: rank ?? 1,
    depth,
    pv,
    score,
    bound,
  };
}

function looksLikePvInfo(line: string): boolean {
  return /\bmultipv\b/i.test(line) && /\bpv\b/i.test(line);
}

function parseBestMove(line: string): { present: true; move: string | null } | { present: false } {
  const trimmed = line.trim();
  if (!trimmed.toLowerCase().startsWith('bestmove ')) {
    return { present: false };
  }
  const tokens = trimmed.split(/\s+/);
  const moveToken = tokens[1];
  if (!moveToken) {
    throw new EngineFailure('MALFORMED_UCI', 'engine_missing_bestmove');
  }
  if (moveToken === '(none)') {
    return { present: true, move: null };
  }
  if (!isUciMove(moveToken)) {
    throw new EngineFailure('MALFORMED_UCI', 'engine_missing_bestmove');
  }
  return { present: true, move: moveToken.toLowerCase() };
}

export type ParseUciTranscriptOptions = {
  multiPv: number;
  engineFen: string;
};

/**
 * Pure fail-closed parse of a complete UCI search transcript.
 * Scores are raw side-to-move engine values; White-POV conversion is score.ts.
 */
export function parseUciTranscript(
  lines: readonly string[],
  options: ParseUciTranscriptOptions
): ParsedUciTranscript {
  let position;
  try {
    position = parsePosition(options.engineFen);
  } catch {
    throw new EngineFailure('INVALID_POSITION', 'invalid_engine_fen');
  }
  const legalMoves = new Set(position.legalUciMoves);
  const multiPv = Math.max(1, options.multiPv);
  const byRank = new Map<number, ParsedUciInfo>();
  let bestMove: string | null | undefined;

  for (const raw of lines) {
    const line = String(raw ?? '').trim();
    if (!line) continue;

    const best = parseBestMove(line);
    if (best.present) {
      bestMove = best.move;
      continue;
    }

    if (!line.toLowerCase().startsWith('info ')) continue;

    const parsed = parseUciInfoLine(line);
    if (!parsed) {
      if (looksLikePvInfo(line)) {
        throw new EngineFailure('MALFORMED_UCI', 'engine_malformed_info');
      }
      continue;
    }
    if (parsed.rank < 1 || parsed.rank > multiPv) {
      throw new EngineFailure('MALFORMED_UCI', 'engine_multipv_overflow');
    }
    if (byRank.has(parsed.rank) && byRank.get(parsed.rank)!.pv[0] !== parsed.pv[0]) {
      const previous = byRank.get(parsed.rank)!;
      if (previous.depth === parsed.depth) {
        throw new EngineFailure('CONTRADICTORY_UCI', 'engine_duplicate_rank');
      }
    }
    const first = parsed.pv[0];
    if (!first || !legalMoves.has(first)) {
      throw new EngineFailure('MALFORMED_UCI', 'engine_illegal_pv_move');
    }
    if (!isLegalUciPv(position.engineFen, parsed.pv)) {
      throw new EngineFailure('MALFORMED_UCI', 'engine_illegal_pv_continuation');
    }
    byRank.set(parsed.rank, parsed);
  }

  if (bestMove === undefined) {
    throw new EngineFailure('MALFORMED_UCI', 'engine_missing_bestmove');
  }

  const linesOut = [...byRank.values()].sort((a, b) => a.rank - b.rank);
  const ranks = linesOut.map((line) => line.rank);
  if (new Set(ranks).size !== ranks.length) {
    throw new EngineFailure('CONTRADICTORY_UCI', 'engine_duplicate_rank');
  }

  if (position.terminal && linesOut.length === 0 && bestMove === null) {
    return { bestMove: null, lines: [] };
  }

  if (position.terminal && bestMove === null) {
    return { bestMove: null, lines: linesOut };
  }

  const rank1 = byRank.get(1);
  if (!rank1) {
    throw new EngineFailure('MALFORMED_UCI', 'engine_missing_rank1');
  }

  if (bestMove === null) {
    throw new EngineFailure('MALFORMED_UCI', 'engine_missing_bestmove');
  }

  if (!legalMoves.has(bestMove)) {
    throw new EngineFailure('MALFORMED_UCI', 'engine_illegal_bestmove');
  }

  if (rank1.pv[0] !== bestMove) {
    throw new EngineFailure('PV_MISMATCH', 'engine_pv_mismatch');
  }

  return { bestMove, lines: linesOut };
}
