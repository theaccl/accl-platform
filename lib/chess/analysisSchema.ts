import { z } from 'zod';

import { parsePosition, isLegalUciPv } from '@/lib/chess/position';
import type { EngineAnalysisResult } from '@/lib/chess/engine/types';
import { UCI_MOVE_PATTERN } from '@/lib/chess/engine/uci';

export const CHESS_ANALYSIS_SCHEMA_VERSION = 'accl.chess.analysis.1';

const uciMove = z.string().regex(UCI_MOVE_PATTERN);

const engineScoreSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cp'), cp: z.number().int() }).strict(),
  z.object({ kind: z.literal('mate'), mate: z.number().int() }).strict(),
  z
    .object({
      kind: z.literal('wdl'),
      win: z.number().int().nonnegative(),
      draw: z.number().int().nonnegative(),
      loss: z.number().int().nonnegative(),
    })
    .strict(),
]);

export const chessAnalysisSchema = z
  .object({
    schemaVersion: z.literal(CHESS_ANALYSIS_SCHEMA_VERSION),
    pov: z.literal('white'),
    position: z
      .object({
        engineFen: z.string().min(1),
        positionKey: z.string().min(1),
        turn: z.enum(['w', 'b']),
        terminal: z.boolean(),
      })
      .strict(),
    engine: z
      .object({
        name: z.literal('stockfish'),
        version: z.string().min(1),
      })
      .strict(),
    search: z
      .object({
        depth: z.number().int().positive(),
        multiPv: z.number().int().positive(),
        timeoutMs: z.number().int().positive().nullable(),
      })
      .strict(),
    bestMove: uciMove.nullable(),
    lines: z.array(
      z
        .object({
          rank: z.number().int().positive(),
          move: uciMove,
          pv: z.array(uciMove).min(1),
          score: engineScoreSchema,
          depth: z.number().int().nonnegative(),
        })
        .strict()
    ),
  })
  .strict()
  .superRefine((value, ctx) => {
    let parsed;
    try {
      parsed = parsePosition(value.position.engineFen);
    } catch {
      ctx.addIssue({
        code: 'custom',
        path: ['position', 'engineFen'],
        message: 'illegal_fen',
      });
      return;
    }

    if (value.position.positionKey !== parsed.positionKey) {
      ctx.addIssue({
        code: 'custom',
        path: ['position', 'positionKey'],
        message: 'position_key_mismatch',
      });
    }
    if (value.position.turn !== parsed.turn) {
      ctx.addIssue({
        code: 'custom',
        path: ['position', 'turn'],
        message: 'turn_mismatch',
      });
    }
    if (value.position.terminal !== parsed.terminal) {
      ctx.addIssue({
        code: 'custom',
        path: ['position', 'terminal'],
        message: 'terminal_mismatch',
      });
    }

    const legal = new Set(parsed.legalUciMoves);
    if (value.bestMove != null && !legal.has(value.bestMove.toLowerCase())) {
      ctx.addIssue({
        code: 'custom',
        path: ['bestMove'],
        message: 'illegal_move',
      });
    }
    if (parsed.terminal && value.bestMove != null) {
      ctx.addIssue({
        code: 'custom',
        path: ['bestMove'],
        message: 'terminal_bestmove_expected_null',
      });
    }

    const ranks = new Set<number>();
    let rank1Move: string | null = null;
    for (let i = 0; i < value.lines.length; i += 1) {
      const line = value.lines[i]!;
      if (line.rank > value.search.multiPv) {
        ctx.addIssue({
          code: 'custom',
          path: ['lines', i, 'rank'],
          message: 'rank_exceeds_multipv',
        });
      }
      if (ranks.has(line.rank)) {
        ctx.addIssue({
          code: 'custom',
          path: ['lines', i, 'rank'],
          message: 'duplicate_rank',
        });
      }
      ranks.add(line.rank);
      if (line.rank === 1) {
        rank1Move = line.move.toLowerCase();
      }
      if (!legal.has(line.move.toLowerCase())) {
        ctx.addIssue({
          code: 'custom',
          path: ['lines', i, 'move'],
          message: 'illegal_move',
        });
      }
      if (line.pv[0]?.toLowerCase() !== line.move.toLowerCase()) {
        ctx.addIssue({
          code: 'custom',
          path: ['lines', i, 'pv'],
          message: 'pv_first_move_mismatch',
        });
      }
      if (!isLegalUciPv(parsed.engineFen, line.pv)) {
        ctx.addIssue({
          code: 'custom',
          path: ['lines', i, 'pv'],
          message: 'illegal_pv_continuation',
        });
      }
    }

    if (!parsed.terminal) {
      if (!ranks.has(1)) {
        ctx.addIssue({
          code: 'custom',
          path: ['lines'],
          message: 'missing_rank_1',
        });
      }
      if (rank1Move != null && value.bestMove?.toLowerCase() !== rank1Move) {
        ctx.addIssue({
          code: 'custom',
          path: ['bestMove'],
          message: 'bestmove_rank1_mismatch',
        });
      }
      if (value.bestMove == null) {
        ctx.addIssue({
          code: 'custom',
          path: ['bestMove'],
          message: 'missing_bestmove',
        });
      }
    }
  });

export type ChessAnalysis = z.infer<typeof chessAnalysisSchema>;
export type ChessAnalysisScore = z.infer<typeof engineScoreSchema>;

export function parseChessAnalysis(data: unknown): ChessAnalysis {
  return chessAnalysisSchema.parse(data);
}

export function safeParseChessAnalysis(data: unknown) {
  return chessAnalysisSchema.safeParse(data);
}

export function chessAnalysisFromEngineResult(result: EngineAnalysisResult): ChessAnalysis {
  return parseChessAnalysis({
    schemaVersion: CHESS_ANALYSIS_SCHEMA_VERSION,
    pov: 'white',
    position: {
      engineFen: result.engineFen,
      positionKey: result.positionKey,
      turn: result.turn,
      terminal: result.terminal,
    },
    engine: {
      name: result.identity.name,
      version: result.identity.version,
    },
    search: {
      depth: result.limits.depth,
      multiPv: result.limits.multiPv,
      timeoutMs: result.limits.timeoutMs,
    },
    bestMove: result.bestMove,
    lines: result.lines.map((line) => ({
      rank: line.rank,
      move: line.move,
      pv: line.pv,
      score: line.score,
      depth: line.depth,
    })),
  });
}
