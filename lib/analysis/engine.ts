import {
  EngineFailure,
  evaluatePositionWithStockfish,
  parsePosition,
  PINNED_STOCKFISH_IDENTITY,
  toMoverPov,
  type EngineAnalysisResult,
  type EngineTransport,
  type Side,
} from '@/lib/chess';

export type EngineCandidateLine = {
  rank: number;
  move: string;
  score: number | null;
  mate: number | null;
  depth: number;
};

export type EngineEval = {
  score: number | null;
  mate: number | null;
  bestMove: string;
  candidateMoves: string[];
  confidence: number;
  depth: number;
  multiPv: number;
  lines: EngineCandidateLine[];
};

type WorkerLike = {
  postMessage: (message: string) => void;
  terminate: () => void;
  onmessage: ((ev: MessageEvent<unknown>) => void) | null;
  onerror: ((err: unknown) => void) | null;
  onmessageerror?: ((err: unknown) => void) | null;
};

function confidenceFor(lines: EngineCandidateLine[], requestDepth: number): number {
  if (lines.length === 0) return 0;
  const top = lines[0];
  const topDepth = Math.max(1, top.depth || requestDepth);
  const depthFactor = Math.min(1, topDepth / Math.max(1, requestDepth));

  const spreadCp =
    lines.length > 1 && top.score !== null && lines[1].score !== null
      ? Math.max(0, top.score - lines[1].score)
      : 50;
  const spreadFactor = Math.min(1, spreadCp / 120);

  const confidence = 0.35 + depthFactor * 0.4 + spreadFactor * 0.25;
  return Number(Math.max(0, Math.min(1, confidence)).toFixed(3));
}

function engineEvalFromWhitePovResult(
  result: EngineAnalysisResult,
  turn: Side,
  requestDepth: number,
  multiPv: number
): EngineEval {
  const lines: EngineCandidateLine[] = result.lines.map((line) => {
    const mover = toMoverPov(line.score, turn);
    return {
      rank: line.rank,
      move: line.move,
      score: mover.kind === 'cp' ? mover.cp : null,
      mate: mover.kind === 'mate' ? mover.mate : null,
      depth: line.depth,
    };
  });
  if (!result.bestMove || lines.length === 0) {
    throw new EngineFailure('MALFORMED_UCI', 'engine_missing_bestmove');
  }
  return {
    score: lines[0]!.score,
    mate: lines[0]!.mate,
    bestMove: result.bestMove,
    candidateMoves: lines.map((line) => line.move),
    confidence: confidenceFor(lines, requestDepth),
    depth: lines[0]!.depth || requestDepth,
    multiPv,
    lines,
  };
}

export class StockfishWebAdapter {
  private worker: WorkerLike | null = null;
  private evalInFlight = false;

  constructor(
    private readonly options?: {
      workerFactory?: () => WorkerLike;
    }
  ) {}

  private buildWorker(): WorkerLike {
    if (this.options?.workerFactory) {
      return this.options.workerFactory();
    }
    return new Worker('/stockfish/stockfish-18-lite-single.js') as WorkerLike;
  }

  private terminateWorker() {
    if (!this.worker) return;
    this.worker.onmessage = null;
    this.worker.onerror = null;
    if (this.worker.onmessageerror) this.worker.onmessageerror = null;
    this.worker.terminate();
    this.worker = null;
  }

  private createTransport(): EngineTransport {
    const worker = this.worker;
    if (!worker) throw new Error('engine_not_initialized');
    return {
      send: (command: string) => {
        worker.postMessage(command);
      },
      subscribe: (handlers) => {
        worker.onmessage = (ev: MessageEvent<unknown>) => {
          const text = typeof ev.data === 'string' ? ev.data : '';
          if (text) handlers.onLine(text);
        };
        worker.onerror = (err) => {
          handlers.onError?.(err);
        };
        worker.onmessageerror = (err) => {
          handlers.onError?.(err);
        };
        return () => {
          if (this.worker === worker) {
            worker.onmessage = null;
            worker.onerror = null;
            if (worker.onmessageerror) worker.onmessageerror = null;
          }
        };
      },
      close: () => {
        this.terminateWorker();
      },
    };
  }

  async init() {
    if (this.worker) return;
    this.worker = this.buildWorker();
    this.worker.onmessage = () => {
      // Handshake lines are consumed by evaluatePositionWithStockfish.
    };
    this.worker.onerror = () => {
      this.terminateWorker();
    };
    this.worker.onmessageerror = () => {
      this.terminateWorker();
    };
    this.worker.postMessage('uci');
    this.worker.postMessage('isready');
    await Promise.resolve();
  }

  async evaluate(fen: string, depth: number, multiPv: number): Promise<EngineEval> {
    const position = parsePosition(fen);
    await this.init();
    if (!this.worker) throw new Error('engine_not_initialized');
    if (this.evalInFlight) throw new Error('engine_busy');

    this.evalInFlight = true;
    const requestDepth = Math.max(1, depth);
    const requestMultiPv = Math.max(1, multiPv);
    try {
      const result = await evaluatePositionWithStockfish({
        transport: this.createTransport(),
        position,
        limits: { depth: requestDepth, multiPv: requestMultiPv },
        identity: PINNED_STOCKFISH_IDENTITY,
      });
      return engineEvalFromWhitePovResult(result, position.turn, requestDepth, requestMultiPv);
    } finally {
      this.evalInFlight = false;
    }
  }

  async close() {
    if (!this.worker) return;
    try {
      this.worker.postMessage('stop');
    } catch {
      // Ignore stop failures; terminate guarantees cleanup.
    }
    this.terminateWorker();
  }

  async dispose() {
    await this.close();
  }
}
