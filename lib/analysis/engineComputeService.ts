import type { FinishedGameAnalysisIntakePayload } from '@/lib/finishedGameAnalysisIntake';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { resolve } from 'node:path';
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

type UciLine = { rank: number; move: string; scoreCp: number | null; pv?: string[] };

const TRAINER_MAX_CONCURRENT = 3;
let trainerConcurrent = 0;
const trainerWaiters: Array<() => void> = [];

/** @internal Exported for deterministic process-lifecycle contract tests. */
export function createStockfishProcessTransport(
  child: ChildProcessWithoutNullStreams,
): EngineTransport {
  let closed = false;

  return {
    send(command: string) {
      if (closed || !child.stdin.writable) throw new Error('stockfish_process_not_writable');
      child.stdin.write(`${command}\n`);
    },
    subscribe(handlers) {
      let stdoutBuffer = '';
      const onStdout = (chunk: Buffer | string) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? '';
        for (const line of lines) handlers.onLine(line);
      };
      let failureReported = false;
      const reportFailure = (error: unknown) => {
        if (closed || failureReported) return;
        failureReported = true;
        handlers.onError?.(error);
      };
      const onError = (error: unknown) => reportFailure(error);
      const onExit = () => reportFailure(new Error('stockfish_process_exited_before_completion'));
      // Emscripten may emit non-fatal runtime diagnostics on stderr while the
      // UCI channel remains healthy. Drain them without converting them into a
      // chess-engine failure; actual spawn errors still use `onError` below.
      const onStderr = () => {};
      child.stdout.on('data', onStdout);
      child.stderr.on('data', onStderr);
      child.on('error', onError);
      child.on('exit', onExit);
      child.on('close', onExit);
      return () => {
        child.stdout.off('data', onStdout);
        child.stderr.off('data', onStderr);
        child.off('error', onError);
        child.off('exit', onExit);
        child.off('close', onExit);
      };
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        child.stdin.end('quit\n');
      } catch {
        // Process may already have exited.
      }
      if (!child.killed) child.kill();
    },
  };
}

function nodeStockfishProcessTransport(): EngineTransport {
  const asmPath = resolve(process.cwd(), 'node_modules', 'stockfish', 'bin', 'stockfish-18-asm.js');
  const child = spawn(process.execPath, [asmPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  return createStockfishProcessTransport(child);
}

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
  // A fresh child process avoids stockfish@18's self-replacing CommonJS ASM
  // initializer and keeps its process-level listeners out of the Next server.
  const transport = nodeStockfishProcessTransport();

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
        pv: line.pv,
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
