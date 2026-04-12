export type EngineCandidateLine = {
  rank: number;
  move: string;
  score: number | null;
  mate: number | null;
  depth: number;
};

export type EngineEval = {
  score: number;
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

type PendingEval = {
  requestId: number;
  depth: number;
  multiPv: number;
  resolve: (v: EngineEval) => void;
  reject: (e: unknown) => void;
  linesByRank: Map<number, EngineCandidateLine>;
};

function parseInfoLine(line: string): EngineCandidateLine | null {
  const rankMatch = line.match(/\bmultipv\s+(\d+)\b/i);
  const pvMatch = line.match(/\bpv\s+([a-h][1-8][a-h][1-8][qrbn]?)/i);
  const cpMatch = line.match(/\bscore cp\s+(-?\d+)\b/i);
  const mateMatch = line.match(/\bscore mate\s+(-?\d+)\b/i);
  const depthMatch = line.match(/\bdepth\s+(\d+)\b/i);
  if (!rankMatch || !pvMatch) return null;

  const rank = Number(rankMatch[1]);
  const depth = depthMatch ? Number(depthMatch[1]) : 0;
  const score = cpMatch ? Number(cpMatch[1]) : null;
  const mate = mateMatch ? Number(mateMatch[1]) : null;

  if (!Number.isFinite(rank) || rank < 1) return null;
  if (!Number.isFinite(depth) || depth < 0) return null;
  if (score !== null && !Number.isFinite(score)) return null;
  if (mate !== null && !Number.isFinite(mate)) return null;

  return {
    rank,
    move: pvMatch[1].toLowerCase(),
    score,
    mate,
    depth,
  };
}

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

export class StockfishWebAdapter {
  private worker: WorkerLike | null = null;
  private ready = false;
  private pending: PendingEval | null = null;
  private requestCounter = 0;

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
    this.ready = false;
  }

  private failPending(err: unknown) {
    const active = this.pending;
    this.pending = null;
    if (active) active.reject(err);
  }

  private terminateActive(err: unknown) {
    this.failPending(err);
    this.terminateWorker();
  }

  async init() {
    if (this.worker) return;
    this.worker = this.buildWorker();
    this.worker.onmessage = (ev: MessageEvent<unknown>) => {
      const text = typeof ev.data === 'string' ? ev.data : '';
      if (!text) return;
      if (text.startsWith('readyok')) {
        this.ready = true;
        return;
      }
      if (this.pending) {
        if (text.startsWith('info ')) {
          const parsed = parseInfoLine(text);
          if (parsed) {
            this.pending.linesByRank.set(parsed.rank, parsed);
          } else if (/\bmultipv\b/i.test(text) && /\bpv\b/i.test(text)) {
            this.terminateActive(new Error('engine_malformed_info'));
          }
          return;
        }
        if (text.startsWith('bestmove ')) {
          const moveMatch = text.match(/^bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?)/i);
          if (!moveMatch) {
            this.terminateActive(new Error('engine_missing_bestmove'));
            return;
          }

          const bestMove = moveMatch[1].toLowerCase();
          const done = this.pending;
          this.pending = null;
          const lines = [...done.linesByRank.values()]
            .filter((line) => line.rank <= Math.max(1, done.multiPv) && Boolean(line.move))
            .sort((a, b) => a.rank - b.rank);
          const seen = new Set<string>();
          const uniqueLines = lines.filter((line) => {
            if (seen.has(line.move)) return false;
            seen.add(line.move);
            return true;
          });

          if (uniqueLines.length === 0 || uniqueLines[0].move !== bestMove) {
            done.reject(new Error('engine_pv_mismatch'));
            this.terminateWorker();
            return;
          }

          done.resolve({
            score: uniqueLines[0].score ?? 0,
            mate: uniqueLines[0].mate,
            bestMove,
            candidateMoves: uniqueLines.map((line) => line.move),
            confidence: confidenceFor(uniqueLines, done.depth),
            depth: uniqueLines[0].depth || done.depth,
            multiPv: done.multiPv,
            lines: uniqueLines,
          });
        }
      }
    };
    this.worker.onerror = (err) => {
      this.terminateActive(err);
    };
    this.worker.onmessageerror = (err) => {
      this.terminateActive(err);
    };
    this.worker.postMessage('uci');
    this.worker.postMessage('isready');
    // Allow ready handshake to settle.
    await Promise.resolve();
  }

  async evaluate(fen: string, depth: number, multiPv: number): Promise<EngineEval> {
    await this.init();
    if (!this.worker) throw new Error('engine_not_initialized');
    if (this.pending) throw new Error('engine_busy');

    return new Promise<EngineEval>((resolve, reject) => {
      this.pending = {
        requestId: ++this.requestCounter,
        depth: Math.max(1, depth),
        multiPv: Math.max(1, multiPv),
        resolve,
        reject,
        linesByRank: new Map<number, EngineCandidateLine>(),
      };
      try {
        this.worker!.postMessage(`setoption name MultiPV value ${Math.max(1, multiPv)}`);
        this.worker!.postMessage(`position fen ${fen}`);
        this.worker!.postMessage(`go depth ${Math.max(1, depth)}`);
      } catch (e) {
        this.terminateActive(e);
      }
    });
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
