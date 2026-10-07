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

let botConcurrent = 0;
type BotProcess = { transport: EngineTransport; ready: Promise<void>; busy: boolean; idleTimer?: ReturnType<typeof setTimeout> };
const botProcesses: BotProcess[] = [];

function acquireBotProcess(): BotProcess {
  let process = botProcesses.find((item) => !item.busy);
  if (!process) {
    const transport = nodeStockfishProcessTransport();
    process = { transport, busy: false, ready: Promise.resolve() };
    process.ready = new Promise<void>((resolveReady, rejectReady) => {
      const timer = setTimeout(() => { transport.close(); rejectReady(new Error('bot_engine_startup_timeout')); }, 10_000);
      const unsubscribe = transport.subscribe({
        onLine(line) {
          if (!line.startsWith('bestmove ')) return;
          clearTimeout(timer); unsubscribe(); resolveReady();
        },
        onError(error) { clearTimeout(timer); unsubscribe(); rejectReady(error); },
      });
      transport.send('uci');
      transport.send('isready');
      transport.send('ucinewgame');
      transport.send('position startpos');
      transport.send('go depth 1');
    });
    // Startup continues safely if the first turn's deadline expires before warmup.
    void process.ready.catch(() => {
      transport.close();
      const index = botProcesses.findIndex((item) => item.transport === transport);
      if (index >= 0) botProcesses.splice(index, 1);
    });
    botProcesses.push(process);
  }
  clearTimeout(process.idleTimer);
  process.busy = true;
  return process;
}

/** Play Computer deadline path. Never waits behind Trainer/post-game searches. */
export async function evaluateBotPositionUci(
  fen: string,
  options: TrainerUciOptions & { deadlineMs: number },
): Promise<{ bestMove: string | null; lines: UciLine[] }> {
  if (botConcurrent >= 3) throw new Error('bot_engine_busy');
  const remainingMs = Math.floor(options.deadlineMs - performance.now());
  if (remainingMs <= 80) throw new Error('bot_engine_budget_exhausted');
  botConcurrent += 1;
  let transport: EngineTransport | null = null;
  const worker = acquireBotProcess();
  let searchStarted = false;
  let healthy = true;
  try {
    await new Promise<void>((resolveReady, rejectReady) => {
      const timer = setTimeout(() => rejectReady(new Error('bot_engine_startup_budget')), remainingMs);
      worker.ready.then(() => { clearTimeout(timer); resolveReady(); }, (error) => { clearTimeout(timer); rejectReady(error); });
    });
    const position = parsePosition(fen);
    transport = worker.transport;
    const processTransport = transport;
    let ready = false;
    const pending: string[] = [];
    const sendReadyCommand = (command: string) => {
      if (command.startsWith('go depth ')) {
        const searchMs = Math.max(1, Math.floor(options.deadlineMs - performance.now() - 200));
        processTransport.send(`${command} movetime ${searchMs}`);
      } else processTransport.send(command);
    };
    // Start search only after startup, so movetime uses the remaining total budget.
    const boundedTransport: EngineTransport = {
      ...processTransport,
      close() { /* Retain this exclusive warmed process for the next bot turn. */ },
      subscribe(handlers) {
        const latestPv = new Map<number, string>();
        return processTransport.subscribe({
          ...handlers,
          onLine(line) {
            // Stockfish can revise a MultiPV rank at the same depth on a timed
            // stop. Submit its final snapshot to the unchanged strict parser.
            if (line.startsWith('info ') && /\bpv\b/.test(line) && /\bscore\b/.test(line)) {
              const rank = Number(/\bmultipv (\d+)/.exec(line)?.[1] ?? 1);
              latestPv.set(rank, line);
              return;
            }
            if (line.startsWith('bestmove ')) {
              for (const info of latestPv.values()) handlers.onLine(info);
            }
            if (line.trim() === 'readyok' && !ready) {
              ready = true;
              try {
                for (const command of pending.splice(0)) sendReadyCommand(command);
              } catch (error) { handlers.onError?.(error); }
            }
            handlers.onLine(line);
          },
        });
      },
      send(command) {
        if (command === 'uci' || command === 'isready') processTransport.send(command);
        else if (ready) sendReadyCommand(command);
        else pending.push(command);
      },
    };
    searchStarted = true;
    const result = await evaluatePositionWithStockfish({
      transport: boundedTransport,
      position,
      limits: {
        depth: options.depth,
        multiPv: options.multiPv,
        timeoutMs: Math.max(1, Math.floor(options.deadlineMs - performance.now())),
      },
      identity: PINNED_STOCKFISH_IDENTITY,
    });
    return {
      bestMove: result.bestMove,
      lines: result.lines.map((line) => ({
        rank: line.rank, move: line.move,
        scoreCp: moverPovCentipawn(line.score, position.turn), pv: line.pv,
      })),
    };
  } catch (error) {
    if (searchStarted) healthy = false;
    throw error;
  } finally {
    worker.busy = false;
    if (!healthy) {
      worker.transport.close();
      const index = botProcesses.indexOf(worker);
      if (index >= 0) botProcesses.splice(index, 1);
    } else {
      worker.idleTimer = setTimeout(() => {
        worker.transport.close();
        const index = botProcesses.indexOf(worker);
        if (index >= 0) botProcesses.splice(index, 1);
      }, 30_000);
      worker.idleTimer.unref();
    }
    botConcurrent -= 1;
  }
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
