import type { FinishedGameAnalysisIntakePayload } from '@/lib/finishedGameAnalysisIntake';
import {
  EngineFailure,
  evaluatePositionWithStockfish,
  moverPovCentipawn,
  parsePosition,
  PINNED_STOCKFISH_IDENTITY,
  type EngineTransport,
} from '@/lib/chess';

export type EngineServiceInput = {
  gameId: string;
  intake: FinishedGameAnalysisIntakePayload;
};

export type EngineServiceResult = {
  provider: 'stockfish';
  version: string;
  evaluation: {
    bestMove: string | null;
    centipawn: number | null;
    confidence: number;
    multiPv: Array<{ rank: number; move: string; scoreCp: number | null }>;
  };
  tacticalTags: string[];
  blunderSignals: Array<{ ply: number; san: string; severity: 'inaccuracy' | 'mistake' | 'blunder' }>;
  analysisMeta: {
    completeness: 'full' | 'insufficient_move_count' | 'insufficient_position_depth';
    minMoveCountTarget: number;
    observedMoveCount: number;
    note: string | null;
  };
};

type StockfishEngine = {
  sendCommand: (cmd: string) => void;
  listener?: (line: string) => void;
  terminate?: () => void;
};

function moveTagHints(san: string): string[] {
  const tags: string[] = [];
  if (san.includes('x')) tags.push('capture');
  if (san.includes('+') || san.includes('#')) tags.push('check-pressure');
  if (/=[QRBN]/.test(san)) tags.push('promotion');
  if (/O-O/.test(san)) tags.push('castling');
  return tags;
}

function detectBlunderSignals(moves: Array<{ san: string | null }>) {
  const out: EngineServiceResult['blunderSignals'] = [];
  moves.forEach((m, idx) => {
    const san = String(m.san ?? '');
    if (!san) return;
    // Placeholder until node-side UCI depth eval is wired in worker.
    if (san.includes('??')) out.push({ ply: idx + 1, san, severity: 'blunder' });
    else if (san.includes('?')) out.push({ ply: idx + 1, san, severity: 'mistake' });
  });
  return out;
}

type UciLine = { rank: number; move: string; scoreCp: number | null };

const TRAINER_MAX_CONCURRENT = 3;
let trainerConcurrent = 0;
const trainerWaiters: Array<() => void> = [];

async function acquireTrainerSlot(): Promise<void> {
  if (trainerConcurrent < TRAINER_MAX_CONCURRENT) {
    trainerConcurrent += 1;
    return;
  }
  await new Promise<void>((resolve) => {
    trainerWaiters.push(resolve);
  });
  trainerConcurrent += 1;
}

function releaseTrainerSlot(): void {
  trainerConcurrent -= 1;
  const next = trainerWaiters.shift();
  if (next) next();
}

export type TrainerUciOptions = {
  depth?: number;
  multiPv?: number;
  timeoutMs?: number;
};

function nodeStockfishTransport(engine: StockfishEngine): EngineTransport {
  let closed = false;
  return {
    send(command: string) {
      engine.sendCommand(command);
    },
    subscribe(handlers) {
      engine.listener = (raw) => {
        handlers.onLine(String(raw ?? ''));
      };
      return () => {
        engine.listener = undefined;
      };
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        engine.sendCommand('quit');
      } catch {
        // Engine may already be gone.
      }
      try {
        engine.terminate?.();
      } catch {
        // Terminate is best-effort.
      }
    },
  };
}

/**
 * Single-position UCI eval for trainer / post-game surfaces. Uses asm Stockfish; bounded depth & time.
 * Concurrency-limited across the process to avoid CPU spikes.
 * Returned `scoreCp` is mover-POV for legacy bot/Trainer ranking.
 */
export async function evaluateTrainerPositionUci(
  fen: string,
  options?: TrainerUciOptions
): Promise<{ bestMove: string | null; lines: UciLine[] }> {
  await acquireTrainerSlot();
  try {
    return await runUciEvaluationInner(fen, options);
  } finally {
    releaseTrainerSlot();
  }
}

async function runUciEvaluationInner(
  fen: string,
  options?: TrainerUciOptions
): Promise<{ bestMove: string | null; lines: UciLine[] }> {
  const depth = Math.min(18, Math.max(6, options?.depth ?? 12));
  const multiPv = Math.min(3, Math.max(1, options?.multiPv ?? 3));
  const timeoutMs = Math.min(20_000, Math.max(3_000, options?.timeoutMs ?? 10_000));
  const position = parsePosition(fen);

  const originalFetch = globalThis.fetch;
  /** Resolved at runtime from node_modules; excluded from the server bundle (Next/Vercel build). */
  const stockfishInit = (
    await import(/* webpackIgnore: true */ 'stockfish')
  ).default as (enginePath?: string) => Promise<StockfishEngine>;
  // WASM builds crash in the current Next route runtime; use asm engine for stable Node execution.
  const engine = await stockfishInit('asm');
  const transport = nodeStockfishTransport(engine);

  try {
    const result = await evaluatePositionWithStockfish({
      transport,
      position,
      limits: { depth, multiPv, timeoutMs },
      identity: PINNED_STOCKFISH_IDENTITY,
    });
    return {
      bestMove: result.bestMove,
      lines: result.lines.map((line) => ({
        rank: line.rank,
        move: line.move,
        scoreCp: moverPovCentipawn(line.score, position.turn),
      })),
    };
  } catch (err) {
    if (err instanceof EngineFailure && err.code === 'ENGINE_TIMEOUT') {
      throw new Error('engine_eval_timeout');
    }
    throw err;
  } finally {
    if (globalThis.fetch !== originalFetch) globalThis.fetch = originalFetch;
  }
}

/**
 * Separate compute-service boundary for engine outputs.
 * This module is intentionally permission-agnostic and only transforms approved intake.
 */
export async function runEngineComputeService(input: EngineServiceInput): Promise<EngineServiceResult> {
  const moves = input.intake.move_logs ?? [];
  const moveCount = moves.length;
  const minimumRichMoveCount = 4;
  const fenToAnalyze =
    String(input.intake.game?.final_fen ?? '').trim() ||
    String(moves[moves.length - 1]?.fen_after ?? '').trim() ||
    String(moves[moves.length - 1]?.fen_before ?? '').trim();
  const uci = fenToAnalyze
    ? await runUciEvaluationInner(fenToAnalyze).catch(() => ({ bestMove: null as string | null, lines: [] as UciLine[] }))
    : { bestMove: null as string | null, lines: [] as UciLine[] };
  const firstMove = uci.bestMove;
  const tacticalTags = [...new Set(moves.flatMap((m) => moveTagHints(String(m.san ?? ''))))];
  const blunderSignals = detectBlunderSignals(moves);
  const insufficientMoveCount = moveCount < minimumRichMoveCount;
  const insufficientPositionDepth = !insufficientMoveCount && uci.lines.length === 0;
  const completeness: EngineServiceResult['analysisMeta']['completeness'] = insufficientMoveCount
    ? 'insufficient_move_count'
    : insufficientPositionDepth
      ? 'insufficient_position_depth'
      : 'full';
  const note =
    completeness === 'insufficient_move_count'
      ? `insufficient_move_count: observed ${moveCount}, require >= ${minimumRichMoveCount} plies for rich evaluation`
      : completeness === 'insufficient_position_depth'
        ? 'insufficient_position_depth: engine returned no stable multipv lines for this terminal position'
        : null;

  return {
    provider: 'stockfish',
    version: 'stockfish-service-v1',
    evaluation: {
      bestMove: firstMove,
      centipawn: uci.lines[0]?.scoreCp ?? null,
      confidence: uci.lines.length > 0 ? 0.75 : moves.length > 0 ? 0.25 : 0,
      multiPv: uci.lines.length > 0 ? uci.lines : firstMove ? [{ rank: 1, move: firstMove, scoreCp: null }] : [],
    },
    tacticalTags,
    blunderSignals,
    analysisMeta: {
      completeness,
      minMoveCountTarget: minimumRichMoveCount,
      observedMoveCount: moveCount,
      note,
    },
  };
}
