import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from '@playwright/test';

import { ENGINE_RUNTIME_REQUEST_SCHEMA } from '@/lib/chess/runtime';
import { parsePosition } from '@/lib/chess/position';
import { executeStockfishLease } from '@/services/stockfish-engine/src/stockfishExecutor';
import {
  consumeEngineStdout,
  parseLinuxProcessRssBytes,
  readLinuxProcessRssBytes,
  StockfishProcess,
  StockfishProcessError,
  waitForManagedProcessExit,
  type StockfishProcessOptions,
} from '@/services/stockfish-engine/src/stockfishProcess';

test('Linux child RSS parser returns bytes and rejects missing or malformed values', () => {
  expect(parseLinuxProcessRssBytes('Name:\tstockfish\nVmRSS:\t  12345 kB\n')).toBe(12_641_280);
  expect(parseLinuxProcessRssBytes('Name:\tstockfish\n')).toBeNull();
  expect(parseLinuxProcessRssBytes('VmRSS:\tnot-a-number kB\n')).toBeNull();
});

test('process RSS reader is Linux-only, process-scoped, and failure-safe', () => {
  const paths: string[] = [];
  const bytes = readLinuxProcessRssBytes(4321, (path) => {
    paths.push(String(path));
    return 'VmRSS:\t2048 kB\n';
  }, 'linux');
  expect(bytes).toBe(2_097_152);
  expect(paths).toEqual(['/proc/4321/status']);
  expect(readLinuxProcessRssBytes(4321, () => { throw new Error('gone'); }, 'linux')).toBeNull();
  expect(readLinuxProcessRssBytes(4321, () => 'VmRSS:\t1 kB\n', 'win32')).toBeNull();
});

const fixture = path.resolve(process.cwd(), 'tests/fixtures/fakeUciEngine.mjs');

async function options(mode = 'healthy'): Promise<StockfishProcessOptions> {
  const executable = process.execPath;
  const digest = createHash('sha256').update(await readFile(executable)).digest('hex');
  return {
    id: `fixture-${mode}`,
    executablePath: executable,
    executableSha256: digest,
    executableArgs: [fixture, mode],
    expectedBigNetwork: 'nn-c288c895ea92.nnue',
    expectedSmallNetwork: 'nn-37f18f62d772.nnue',
    handshakeTimeoutMs: 200,
    recoveryTimeoutMs: 100,
    terminateGraceMs: 100,
  };
}

test('verifies checksum and UCI identity before exposing a lease', async () => {
  const worker = new StockfishProcess(await options());
  await worker.warm();
  expect(worker.state).toBe('IDLE');

  const transport = await worker.prepareLease();
  expect(worker.state).toBe('LEASED');
  transport.close();
  await worker.resetAfterLease();
  expect(worker.state).toBe('IDLE');

  await worker.terminate();
  await worker.terminate();
  expect(worker.state).toBe('TERMINATED');
});

test('rejects a checksum mismatch without spawning', async () => {
  const config = await options();
  const worker = new StockfishProcess({ ...config, executableSha256: '0'.repeat(64) });
  await expect(worker.warm()).rejects.toMatchObject({ code: 'engine_binary_checksum_mismatch' });
  expect(worker.state).toBe('STARTING');
});

test('rejects an unexpected UCI identity and terminates the process', async () => {
  const worker = new StockfishProcess(await options('wrong-identity'));
  await expect(worker.warm()).rejects.toMatchObject({ code: 'engine_uci_identity_mismatch' });
  expect(worker.state).toBe('TERMINATED');
});

test('recovers an interrupted lease only after bestmove and readyok barriers', async () => {
  const worker = new StockfishProcess(await options());
  await worker.warm();
  const transport = await worker.prepareLease();
  transport.send('go depth 1');
  transport.close();
  await expect(worker.recoverAfterInterrupt()).resolves.toBe(true);
  expect(worker.state).toBe('IDLE');
  await worker.terminate();
});

test('retires when the stop barrier does not complete', async () => {
  const worker = new StockfishProcess(await options('hang-stop'));
  await worker.warm();
  const transport = await worker.prepareLease();
  transport.send('go depth 1');
  transport.close();
  await expect(worker.recoverAfterInterrupt()).resolves.toBe(false);
  expect(worker.state).toBe('RETIRING');
  await worker.terminate();
});

test('propagates process crashes to a lease exactly through its error channel', async () => {
  const worker = new StockfishProcess(await options('crash-on-go'));
  await worker.warm();
  const transport = await worker.prepareLease();
  const error = new Promise<unknown>((resolve) => transport.subscribe({ onLine: () => {}, onError: resolve }));
  transport.send('go depth 1');
  await expect(error).resolves.toBeInstanceOf(StockfishProcessError);
  transport.close();
  await worker.terminate();
});

test('feeds a physical lease through the unchanged Slice 2 parser and score authority', async () => {
  const worker = new StockfishProcess(await options('respond-search'));
  await worker.warm();
  const transport = await worker.prepareLease();
  const position = parsePosition(
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  );
  const result = await executeStockfishLease({
    transport,
    position,
    request: {
      schemaVersion: ENGINE_RUNTIME_REQUEST_SCHEMA,
      correlationId: 'fixture-slice2-authority',
      engineFen: position.engineFen,
      lane: 'TRAINER_INTERACTIVE',
      limits: { depth: 8, multiPv: 1, timeoutMs: 1_000 },
      remainingBudgetMs: 1_500,
    },
  });

  expect(result).toMatchObject({
    pov: 'white',
    bestMove: 'e2e4',
    identity: { name: 'stockfish', version: '18-cb3d4ee9b47d' },
    lines: [{ rank: 1, score: { kind: 'cp', cp: 23 }, pv: ['e2e4', 'e7e5'] }],
  });
  await worker.resetAfterLease();
  await worker.terminate();
});

test('consumeEngineStdout accepts a complete multi-line burst larger than 8 KiB', () => {
  const line = `info depth 8 multipv 1 score cp 20 pv e2e4 ${'e7e5 '.repeat(20)}`;
  const chunk = `${`${line}\n`.repeat(80)}`;
  expect(Buffer.byteLength(chunk, 'utf8')).toBeGreaterThan(8192);
  const consumed = consumeEngineStdout('', chunk);
  expect(consumed.overflow).toBe(false);
  expect(consumed.lines).toHaveLength(80);
  expect(consumed.pending).toBe('');
});

test('consumeEngineStdout poisons a chunk with uciok plus an oversized leftover', () => {
  const consumed = consumeEngineStdout('', `uciok\n${'x'.repeat(8193)}`);
  expect(consumed).toEqual({ pending: '', lines: [], overflow: true });
});

test('burst of complete UCI lines larger than 8 KiB still reaches IDLE', async () => {
  const worker = new StockfishProcess(await options('burst-uci'));
  await worker.warm();
  expect(worker.state).toBe('IDLE');
  await worker.terminate();
});

test('uciok plus an oversized leftover never exposes IDLE', async () => {
  const worker = new StockfishProcess(await options('long-line'));
  await expect(worker.warm()).rejects.toBeInstanceOf(Error);
  expect(worker.state).not.toBe('IDLE');
  await worker.terminate().catch(() => {});
});

test('waitForManagedProcessExit reports timeout without forging exit', async () => {
  const kills: NodeJS.Signals[] = [];
  const child = {
    once() {},
    kill(signal: NodeJS.Signals) {
      kills.push(signal);
      return true;
    },
  };
  await expect(waitForManagedProcessExit(child, { graceMs: 10, killWatchdogMs: 10 })).resolves.toBe(
    'timeout'
  );
  expect(kills).toEqual(['SIGTERM', 'SIGKILL']);
});

test('terminate timeout stays RETIRING and clears the cached promise for retry', async () => {
  let attempts = 0;
  const worker = new StockfishProcess({
    ...(await options()),
    waitForExit: async (child, exitOptions) => {
      attempts += 1;
      if (attempts <= 2) return 'timeout';
      return await waitForManagedProcessExit(child, exitOptions);
    },
  });
  await worker.warm();
  await expect(worker.terminate()).rejects.toMatchObject({ code: 'engine_process_terminate_timeout' });
  expect(worker.state).toBe('RETIRING');
  await expect(worker.terminate()).rejects.toMatchObject({ code: 'engine_process_terminate_timeout' });
  expect(worker.state).toBe('RETIRING');
  await worker.terminate();
  expect(worker.state).toBe('TERMINATED');
});

test('concurrent terminate calls share the in-flight promise', async () => {
  let release!: (result: 'exited') => void;
  const worker = new StockfishProcess({
    ...(await options()),
    waitForExit: async (child) => {
      await new Promise<'exited'>((resolve) => {
        release = resolve;
      });
      child.kill('SIGKILL');
      return 'exited';
    },
  });
  await worker.warm();
  const first = worker.terminate();
  const second = worker.terminate();
  release('exited');
  await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
  expect(worker.state).toBe('TERMINATED');
});

test('ignore-sigterm still reports TERMINATED only after observed exit', async () => {
  const worker = new StockfishProcess(await options('ignore-sigterm'));
  await worker.warm();
  await worker.terminate();
  expect(worker.state).toBe('TERMINATED');
});
