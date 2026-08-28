import type { ParsedPosition } from '@/lib/chess/position';
import { parsePosition } from '@/lib/chess/position';
import { toWhitePov } from '@/lib/chess/engine/score';
import {
  EngineFailure,
  type EngineAnalysisResult,
  type EngineIdentity,
  type EngineLine,
  type EngineSearchLimits,
  type EvaluatePositionInput,
} from '@/lib/chess/engine/types';
import { parseUciTranscript } from '@/lib/chess/engine/uci';

/** Pinned identity for legacy Stockfish wrappers that execute the lockfile package. */
export const PINNED_STOCKFISH_IDENTITY: EngineIdentity = {
  name: 'stockfish',
  version: '18.0.7',
};

/** @deprecated Use PINNED_STOCKFISH_IDENTITY in wrappers; the adapter never infers this. */
export const DEFAULT_STOCKFISH_IDENTITY = PINNED_STOCKFISH_IDENTITY;

export const ENGINE_DEFAULT_DEPTH = 12;
export const ENGINE_MAX_DEPTH = 24;
export const ENGINE_DEFAULT_MULTIPV = 1;
export const ENGINE_MAX_MULTIPV = 8;
export const ENGINE_DEFAULT_TIMEOUT_MS = 10_000;
export const ENGINE_MAX_TIMEOUT_MS = 20_000;
export const ENGINE_MAX_TRANSCRIPT_LINES = 512;
export const ENGINE_MAX_TRANSCRIPT_BYTES = 65_536;

function clampLimits(limits: EngineSearchLimits | undefined): {
  depth: number;
  multiPv: number;
  timeoutMs: number;
} {
  const depthRaw = limits?.depth ?? ENGINE_DEFAULT_DEPTH;
  const multiPvRaw = limits?.multiPv ?? ENGINE_DEFAULT_MULTIPV;
  const timeoutRaw = limits?.timeoutMs ?? ENGINE_DEFAULT_TIMEOUT_MS;
  return {
    depth: Math.min(ENGINE_MAX_DEPTH, Math.max(1, Math.floor(depthRaw))),
    multiPv: Math.min(ENGINE_MAX_MULTIPV, Math.max(1, Math.floor(multiPvRaw))),
    timeoutMs: Math.min(ENGINE_MAX_TIMEOUT_MS, Math.max(1, Math.floor(timeoutRaw))),
  };
}

function requireIdentity(identity: EngineIdentity | undefined): EngineIdentity {
  if (
    !identity ||
    identity.name !== 'stockfish' ||
    typeof identity.version !== 'string' ||
    identity.version.trim().length === 0
  ) {
    throw new EngineFailure('ENGINE_CRASH', 'engine_identity_required');
  }
  const version = identity.version.trim();
  if (/[\u0000-\u001F\u007F]/.test(version)) {
    throw new EngineFailure('ENGINE_CRASH', 'engine_identity_required');
  }
  return { name: 'stockfish', version };
}

function sameMoveSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const other = new Set(b);
  return a.every((move) => other.has(move));
}

function reparsePosition(input: ParsedPosition): ParsedPosition {
  let canonical: ParsedPosition;
  try {
    canonical = parsePosition(input?.engineFen);
  } catch {
    throw new EngineFailure('INVALID_POSITION', 'invalid_engine_fen');
  }
  if (
    input.engineFen !== canonical.engineFen ||
    input.positionKey !== canonical.positionKey ||
    input.turn !== canonical.turn ||
    input.terminal !== canonical.terminal ||
    !sameMoveSet(input.legalUciMoves ?? [], canonical.legalUciMoves)
  ) {
    throw new EngineFailure('INVALID_POSITION', 'contradictory_parsed_position');
  }
  return canonical;
}

/**
 * Injected-transport Stockfish evaluation. No pool, singleton, or scheduling.
 * Reparses `engineFen` before any subscribe/send. Identity is required from the caller.
 */
export async function evaluatePositionWithStockfish(
  input: EvaluatePositionInput
): Promise<EngineAnalysisResult> {
  const identity = requireIdentity(input.identity);
  const position = reparsePosition(input.position);
  const limits = clampLimits(input.limits);
  const { transport } = input;

  let settled = false;
  let cleaned = false;
  let unsubscribe: (() => void) | null = null;
  const transcript: string[] = [];
  let transcriptBytes = 0;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      unsubscribe?.();
    } catch {
      // Unsubscribe must not prevent transport close.
    }
    unsubscribe = null;
    try {
      transport.close();
    } catch {
      // Close is best-effort after timeout/crash.
    }
  };

  return await new Promise<EngineAnalysisResult>((resolve, reject) => {
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err instanceof EngineFailure ? err : new EngineFailure('ENGINE_CRASH', 'engine_crash'));
    };

    const succeed = (result: EngineAnalysisResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const timeout = setTimeout(() => {
      fail(new EngineFailure('ENGINE_TIMEOUT', 'engine_eval_timeout'));
    }, limits.timeoutMs);

    const finish = (fn: () => void) => {
      clearTimeout(timeout);
      fn();
    };

    try {
      unsubscribe = transport.subscribe({
        onLine: (raw) => {
          if (settled) return;
          const line = String(raw ?? '').trim();
          if (!line) return;
          transcriptBytes += line.length + 1;
          if (
            transcript.length + 1 > ENGINE_MAX_TRANSCRIPT_LINES ||
            transcriptBytes > ENGINE_MAX_TRANSCRIPT_BYTES
          ) {
            finish(() => fail(new EngineFailure('MALFORMED_UCI', 'engine_transcript_overflow')));
            return;
          }
          transcript.push(line);
          if (!line.toLowerCase().startsWith('bestmove ')) return;
          try {
            const parsed = parseUciTranscript(transcript, {
              multiPv: limits.multiPv,
              engineFen: position.engineFen,
            });
            const lines: EngineLine[] = parsed.lines.map((info) => ({
              rank: info.rank,
              move: info.pv[0]!,
              pv: info.pv,
              score: toWhitePov(info.score, position.turn),
              depth: info.depth || limits.depth,
              bound: info.bound,
            }));
            finish(() =>
              succeed({
                identity,
                positionKey: position.positionKey,
                engineFen: position.engineFen,
                turn: position.turn,
                pov: 'white',
                terminal: position.terminal,
                bestMove: parsed.bestMove,
                lines,
                limits,
              })
            );
          } catch (err) {
            finish(() => fail(err));
          }
        },
        onError: (err) => {
          finish(() => fail(err));
        },
      });

      transport.send('uci');
      transport.send('isready');
      transport.send('ucinewgame');
      transport.send(`setoption name MultiPV value ${limits.multiPv}`);
      transport.send(`position fen ${position.engineFen}`);
      transport.send(`go depth ${limits.depth}`);
    } catch (err) {
      finish(() => fail(err));
    }
  });
}
