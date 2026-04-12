import { test, expect } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';

import { getChessTruthForMoves, ChessTruthError } from '../../lib/analysis/intelligence';
import { StockfishWebAdapter } from '../../lib/analysis/engine';

type WorkerLike = {
  postMessage: (message: string) => void;
  terminate: () => void;
  onmessage: ((ev: MessageEvent<unknown>) => void) | null;
  onerror: ((err: unknown) => void) | null;
  onmessageerror?: ((err: unknown) => void) | null;
};

const START_FEN = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B5/5N2/PPPPPPPP/RNBQK2R b KQkq - 2 2';

function createProcessWorker(script: string, args: string[] = []): WorkerLike {
  const child: ChildProcessWithoutNullStreams = spawn(process.execPath, [script, ...args], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let onmessage: ((ev: MessageEvent<unknown>) => void) | null = null;
  let onerror: ((err: unknown) => void) | null = null;
  let onmessageerror: ((err: unknown) => void) | null = null;
  let stdoutBuffer = '';
  let stderrBuffer = '';

  const flushLines = (chunk: string) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      onmessage?.({ data: trimmed } as MessageEvent<unknown>);
    }
  };

  child.stdout.on('data', (data) => flushLines(String(data)));
  child.stderr.on('data', (data) => {
    stderrBuffer += String(data);
  });
  child.on('error', (err) => {
    onerror?.(err);
  });
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      onmessageerror?.(new Error(`engine_process_exit_${code}:${stderrBuffer.trim()}`));
    }
  });

  return {
    postMessage(message: string) {
      child.stdin.write(`${message}\n`);
    },
    terminate() {
      child.kill();
    },
    get onmessage() {
      return onmessage;
    },
    set onmessage(handler) {
      onmessage = handler;
    },
    get onerror() {
      return onerror;
    },
    set onerror(handler) {
      onerror = handler;
    },
    get onmessageerror() {
      return onmessageerror;
    },
    set onmessageerror(handler) {
      onmessageerror = handler;
    },
  };
}

function realStockfishAdapter() {
  const script = path.resolve(process.cwd(), 'node_modules/stockfish/scripts/cli.js');
  return new StockfishWebAdapter({
    workerFactory: () => createProcessWorker(script),
  });
}

test.describe('Engine hardening integration', () => {
  test('valid FEN returns best_move, candidate_moves, and confidence', async () => {
    const adapter = realStockfishAdapter();
    const res = await getChessTruthForMoves({
      fen: START_FEN,
      mode: 'analyst',
      moves: [],
      adapter,
    });

    expect(res.engine?.best_move).toBeTruthy();
    expect(res.engine?.candidate_moves.length).toBeGreaterThan(1);
    expect(res.engine?.confidence).toBeGreaterThanOrEqual(0);
    expect(res.engine?.confidence).toBeLessThanOrEqual(1);
  });

  test('invalid FEN is blocked before engine call', async () => {
    let called = false;
    const adapter = {
      evaluate: async () => {
        called = true;
        throw new Error('should_not_call_engine');
      },
      dispose: async () => {},
    } as unknown as StockfishWebAdapter;

    await expect(
      getChessTruthForMoves({
        fen: 'not a fen',
        mode: 'coach',
        moves: [],
        adapter,
      })
    ).rejects.toMatchObject({ code: 'INVALID_FEN' as ChessTruthError['code'] });
    expect(called).toBe(false);
  });

  test('multiPV respects mode config (analyst multiple, coach single)', async () => {
    const analyst = await getChessTruthForMoves({
      fen: START_FEN,
      mode: 'analyst',
      moves: [],
      adapter: realStockfishAdapter(),
    });
    const coach = await getChessTruthForMoves({
      fen: START_FEN,
      mode: 'coach',
      moves: [],
      adapter: realStockfishAdapter(),
    });

    expect(analyst.engine?.candidate_moves.length).toBeGreaterThan(1);
    expect(coach.engine?.candidate_moves.length).toBe(1);
  });

  test('timeout path returns ENGINE_TIMEOUT', async () => {
    const hangingScript = path.resolve(process.cwd(), 'tests/fixtures/hangingEngine.js');
    const adapter = new StockfishWebAdapter({
      workerFactory: () => createProcessWorker(hangingScript),
    });

    await expect(
      getChessTruthForMoves({
        fen: START_FEN,
        mode: 'coach',
        moves: [],
        adapter,
      })
    ).rejects.toMatchObject({ code: 'ENGINE_TIMEOUT' as ChessTruthError['code'] });
  });

  test('crash/malformed worker output returns ENGINE_CRASH', async () => {
    const malformedScript = path.resolve(process.cwd(), 'tests/fixtures/malformedEngine.js');
    const adapter = new StockfishWebAdapter({
      workerFactory: () => createProcessWorker(malformedScript),
    });

    await expect(
      getChessTruthForMoves({
        fen: START_FEN,
        mode: 'coach',
        moves: [],
        adapter,
      })
    ).rejects.toMatchObject({ code: 'ENGINE_CRASH' as ChessTruthError['code'] });
  });

  test('sanitization blocks raw cp/pv/uci leakage', async () => {
    const res = await getChessTruthForMoves({
      fen: START_FEN,
      mode: 'analyst',
      moves: [{ san: 'Nf6' }],
      adapter: realStockfishAdapter(),
    });

    expect(res.rows[0]?.engineScore).toBeUndefined();
    expect(res.engine?.best_move).toMatch(/^[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?|^O-O(-O)?[+#]?$/);
    expect(res.engine?.candidate_moves.join(' ')).not.toMatch(/\b[a-h][1-8][a-h][1-8][qrbn]?\b/i);
  });
});
