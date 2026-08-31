import { createHash } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

import type { EngineTransport } from '@/lib/chess/engine/types';
import { createLeaseTransport, type PhysicalWorkerIo } from './leaseTransport';
import type { PhysicalEngineWorker, PhysicalEngineWorkerFactory } from './pool';

const MAX_PENDING_LINE_BYTES = 8_192;
const MAX_HANDSHAKE_LINES = 512;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 5_000;
const DEFAULT_RECOVERY_TIMEOUT_MS = 500;
const DEFAULT_TERMINATE_GRACE_MS = 1_000;

export type StockfishProcessState =
  | 'STARTING'
  | 'WARMING'
  | 'IDLE'
  | 'LEASED'
  | 'RESETTING'
  | 'RETIRING'
  | 'TERMINATED';

export type StockfishProcessOptions = {
  id: string;
  executablePath: string;
  executableSha256: string;
  /** Reserved for deterministic fixtures. Production construction must leave this empty. */
  executableArgs?: readonly string[];
  expectedUciName?: string;
  expectedBigNetwork?: string;
  expectedSmallNetwork?: string;
  handshakeTimeoutMs?: number;
  recoveryTimeoutMs?: number;
  terminateGraceMs?: number;
  /** Reserved for deterministic fixtures. Production construction must omit this. */
  waitForExit?: (
    child: {
      once(event: 'exit', listener: () => void): void;
      kill(signal: NodeJS.Signals): boolean;
    },
    options: { graceMs: number; killWatchdogMs: number }
  ) => Promise<'exited' | 'timeout'>;
};

export function parseLinuxProcessRssBytes(status: string): number | null {
  const match = /^VmRSS:\s+(\d+)\s+kB\s*$/m.exec(status);
  if (!match?.[1]) return null;
  const bytes = Number(match[1]) * 1024;
  return Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : null;
}

export function readLinuxProcessRssBytes(
  pid: number,
  readStatus: (path: string, encoding: BufferEncoding) => string = readFileSync,
  platform: NodeJS.Platform = process.platform
): number | null {
  if (platform !== 'linux' || !Number.isInteger(pid) || pid <= 0) return null;
  try {
    return parseLinuxProcessRssBytes(readStatus(`/proc/${pid}/status`, 'utf8'));
  } catch {
    return null;
  }
}

export function consumeEngineStdout(
  pending: string,
  chunk: string,
  maxUnterminatedBytes = MAX_PENDING_LINE_BYTES
): { pending: string; lines: string[]; overflow: boolean } {
  let buffer = pending + chunk;
  const lines: string[] = [];
  while (true) {
    const newline = buffer.indexOf('\n');
    if (newline < 0) break;
    const line = buffer.slice(0, newline).replace(/\r$/, '').trim();
    buffer = buffer.slice(newline + 1);
    if (line) lines.push(line);
  }
  if (Buffer.byteLength(buffer, 'utf8') > maxUnterminatedBytes) {
    return { pending: '', lines: [], overflow: true };
  }
  return { pending: buffer, lines, overflow: false };
}

export async function waitForManagedProcessExit(
  child: {
    once(event: 'exit', listener: () => void): void;
    kill(signal: NodeJS.Signals): boolean;
  },
  options: { graceMs: number; killWatchdogMs: number }
): Promise<'exited' | 'timeout'> {
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (result: 'exited' | 'timeout') => {
      if (settled) return;
      settled = true;
      clearTimeout(graceTimer);
      clearTimeout(watchdog);
      resolve(result);
    };
    child.once('exit', () => finish('exited'));
    const graceTimer = setTimeout(() => {
      child.kill('SIGKILL');
    }, options.graceMs);
    const watchdog = setTimeout(() => finish('timeout'), options.graceMs + options.killWatchdogMs);
    child.kill('SIGTERM');
  });
}

type LineHandlers = {
  onLine: (line: string) => void;
  onError?: (error: unknown) => void;
};

export class StockfishProcessError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'StockfishProcessError';
  }
}

async function sha256File(path: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/** Native, single-process UCI worker. It never logs commands or engine output. */
export class StockfishProcess implements PhysicalEngineWorker {
  readonly id: string;
  private stateValue: StockfishProcessState = 'STARTING';
  private child: ChildProcessWithoutNullStreams | null = null;
  private readonly listeners = new Set<LineHandlers>();
  private pendingStdout = '';
  private processFailure: StockfishProcessError | null = null;
  private terminatePromise: Promise<void> | null = null;

  constructor(private readonly options: StockfishProcessOptions) {
    this.id = options.id;
    if (!/^[a-f0-9]{64}$/.test(options.executableSha256)) {
      throw new StockfishProcessError('engine_binary_checksum_invalid');
    }
  }

  get state(): StockfishProcessState {
    return this.stateValue;
  }

  async warm(): Promise<void> {
    if (this.stateValue !== 'STARTING') {
      throw new StockfishProcessError('engine_worker_state_invalid');
    }
    const actualSha256 = await sha256File(this.options.executablePath);
    if (actualSha256 !== this.options.executableSha256) {
      throw new StockfishProcessError('engine_binary_checksum_mismatch');
    }

    this.stateValue = 'WARMING';
    this.spawnChild();
    try {
      const transcript = await this.commandUntil('uci', (line) => line === 'uciok');
      this.verifyIdentity(transcript);
      this.sendRaw('setoption name Threads value 1');
      this.sendRaw('setoption name Hash value 128');
      this.sendRaw('setoption name Ponder value false');
      await this.commandUntil('isready', (line) => line === 'readyok');
      this.stateValue = 'IDLE';
    } catch (error) {
      await this.terminate();
      throw error;
    }
  }

  async prepareLease(): Promise<EngineTransport> {
    if (this.stateValue !== 'IDLE') {
      throw new StockfishProcessError('engine_worker_state_invalid');
    }
    this.stateValue = 'RESETTING';
    try {
      this.sendRaw('ucinewgame');
      await this.commandUntil('isready', (line) => line === 'readyok');
      this.stateValue = 'LEASED';
      return createLeaseTransport(this.io());
    } catch (error) {
      this.stateValue = 'RETIRING';
      throw error;
    }
  }

  async resetAfterLease(): Promise<void> {
    if (this.stateValue !== 'LEASED') {
      throw new StockfishProcessError('engine_worker_state_invalid');
    }
    this.stateValue = 'RESETTING';
    try {
      await this.commandUntil('isready', (line) => line === 'readyok');
      this.stateValue = 'IDLE';
    } catch (error) {
      this.stateValue = 'RETIRING';
      throw error;
    }
  }

  async recoverAfterInterrupt(): Promise<boolean> {
    if (this.stateValue !== 'LEASED') return false;
    this.stateValue = 'RESETTING';
    try {
      await this.commandUntil(
        'stop',
        (line) => line.toLowerCase().startsWith('bestmove '),
        this.options.recoveryTimeoutMs ?? DEFAULT_RECOVERY_TIMEOUT_MS
      );
      await this.commandUntil(
        'isready',
        (line) => line === 'readyok',
        this.options.recoveryTimeoutMs ?? DEFAULT_RECOVERY_TIMEOUT_MS
      );
      this.stateValue = 'IDLE';
      return true;
    } catch {
      this.stateValue = 'RETIRING';
      return false;
    }
  }

  residentMemoryBytes(): number | null {
    const pid = this.child?.pid;
    return pid === undefined ? null : readLinuxProcessRssBytes(pid);
  }

  async terminate(): Promise<void> {
    if (this.terminatePromise) return await this.terminatePromise;
    this.terminatePromise = this.terminateInner();
    try {
      await this.terminatePromise;
    } catch (error) {
      this.terminatePromise = null;
      throw error;
    }
  }

  private async terminateInner(): Promise<void> {
    this.stateValue = 'RETIRING';
    const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      this.stateValue = 'TERMINATED';
      this.listeners.clear();
      this.child = null;
      return;
    }

    const wait = this.options.waitForExit ?? waitForManagedProcessExit;
    const result = await wait(child, {
      graceMs: this.options.terminateGraceMs ?? DEFAULT_TERMINATE_GRACE_MS,
      killWatchdogMs: 500,
    });
    if (result === 'timeout') {
      this.failProcess('engine_process_terminate_timeout');
      throw new StockfishProcessError('engine_process_terminate_timeout');
    }
    this.listeners.clear();
    this.child = null;
    this.stateValue = 'TERMINATED';
  }

  private spawnChild(): void {
    const child = spawn(this.options.executablePath, [...(this.options.executableArgs ?? [])], {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      // Do not inherit service credentials or other ambient environment values.
      env: { NODE_ENV: 'production' },
    });
    this.child = child;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => this.acceptStdout(chunk));
    child.stderr.resume();
    child.on('error', () => this.failProcess('engine_process_error'));
    child.on('exit', () => this.failProcess('engine_process_exit'));
  }

  private acceptStdout(chunk: string): void {
    const consumed = consumeEngineStdout(this.pendingStdout, chunk);
    this.pendingStdout = consumed.pending;
    if (consumed.overflow) {
      this.failProcess('engine_output_line_overflow');
      void this.terminate();
      return;
    }
    for (const line of consumed.lines) {
      for (const listener of [...this.listeners]) listener.onLine(line);
    }
  }

  private failProcess(code: string): void {
    if (this.stateValue === 'TERMINATED') return;
    this.processFailure ??= new StockfishProcessError(code);
    for (const listener of [...this.listeners]) listener.onError?.(this.processFailure);
  }

  private io(): PhysicalWorkerIo {
    return {
      send: (command) => this.sendRaw(command),
      subscribe: (handlers) => this.subscribe(handlers),
    };
  }

  private subscribe(handlers: LineHandlers): () => void {
    if (this.processFailure) {
      queueMicrotask(() => handlers.onError?.(this.processFailure));
      return () => undefined;
    }
    this.listeners.add(handlers);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.listeners.delete(handlers);
    };
  }

  private sendRaw(command: string): void {
    const child = this.child;
    if (!child || this.processFailure || !child.stdin.writable) {
      throw this.processFailure ?? new StockfishProcessError('engine_process_unavailable');
    }
    if (/[\r\n\u0000]/.test(command)) {
      throw new StockfishProcessError('engine_command_invalid');
    }
    child.stdin.write(`${command}\n`);
  }

  private async commandUntil(
    command: string,
    predicate: (line: string) => boolean,
    timeoutMs = this.options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS
  ): Promise<string[]> {
    return await new Promise<string[]>((resolve, reject) => {
      const lines: string[] = [];
      let settled = false;
      let unsubscribe: () => void = () => undefined;
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        unsubscribe();
        if (error) reject(error);
        else resolve(lines);
      };
      const timeout = setTimeout(
        () => finish(new StockfishProcessError('engine_handshake_timeout')),
        timeoutMs
      );
      unsubscribe = this.subscribe({
        onLine: (line) => {
          lines.push(line);
          if (lines.length > MAX_HANDSHAKE_LINES) {
            finish(new StockfishProcessError('engine_handshake_overflow'));
          } else if (predicate(line)) {
            finish();
          }
        },
        onError: (error) => finish(error),
      });
      try {
        this.sendRaw(command);
      } catch (error) {
        finish(error);
      }
    });
  }

  private verifyIdentity(lines: readonly string[]): void {
    const expectedName = this.options.expectedUciName ?? 'Stockfish 18';
    if (!lines.includes(`id name ${expectedName}`)) {
      throw new StockfishProcessError('engine_uci_identity_mismatch');
    }
    if (
      this.options.expectedBigNetwork &&
      !lines.some(
        (line) => line.includes('option name EvalFile ') && line.includes(this.options.expectedBigNetwork!)
      )
    ) {
      throw new StockfishProcessError('engine_big_network_identity_mismatch');
    }
    if (
      this.options.expectedSmallNetwork &&
      !lines.some(
        (line) =>
          line.includes('option name EvalFileSmall ') && line.includes(this.options.expectedSmallNetwork!)
      )
    ) {
      throw new StockfishProcessError('engine_small_network_identity_mismatch');
    }
  }
}

export type ProductionStockfishFactoryOptions = {
  executablePath: string;
  executableSha256: string;
};

/** Production construction deliberately provides no arguments or inherited environment. */
export function createProductionStockfishWorkerFactory(
  options: ProductionStockfishFactoryOptions
): PhysicalEngineWorkerFactory {
  let sequence = 0;
  return async () =>
    new StockfishProcess({
      id: `stockfish-${++sequence}`,
      executablePath: options.executablePath,
      executableSha256: options.executableSha256,
      expectedUciName: 'Stockfish 18',
      expectedBigNetwork: 'nn-c288c895ea92.nnue',
      expectedSmallNetwork: 'nn-37f18f62d772.nnue',
    });
}
