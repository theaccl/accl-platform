import type { ParsedPosition } from '@/lib/chess/position';
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

export const DEFAULT_STOCKFISH_IDENTITY: EngineIdentity = {
  name: 'stockfish',
  version: '18.0.7',
};

function clampLimits(limits: EngineSearchLimits | undefined): {
  depth: number;
  multiPv: number;
  timeoutMs: number | null;
} {
  const depth = Math.max(1, Math.floor(limits?.depth ?? 12));
  const multiPv = Math.max(1, Math.min(8, Math.floor(limits?.multiPv ?? 1)));
  const timeoutMs =
    limits?.timeoutMs == null ? null : Math.max(1, Math.floor(limits.timeoutMs));
  return { depth, multiPv, timeoutMs };
}

function positionCommand(position: ParsedPosition): string {
  return `position fen ${position.engineFen}`;
}

/**
 * Injected-transport Stockfish evaluation. No pool, singleton, or scheduling.
 * Accepts a validated parsed position only — never a raw user string.
 */
export async function evaluatePositionWithStockfish(
  input: EvaluatePositionInput
): Promise<EngineAnalysisResult> {
  const { transport, position } = input;
  const limits = clampLimits(input.limits);
  const identity = input.identity ?? DEFAULT_STOCKFISH_IDENTITY;
  const legalMoves = new Set(position.legalUciMoves);

  let settled = false;
  let cleaned = false;
  let unsubscribe: (() => void) | null = null;
  const transcript: string[] = [];

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

    let timeout: ReturnType<typeof setTimeout> | null = null;
    if (limits.timeoutMs != null) {
      timeout = setTimeout(() => {
        fail(new EngineFailure('ENGINE_TIMEOUT', 'engine_eval_timeout'));
      }, limits.timeoutMs);
    }

    const finish = (fn: () => void) => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      fn();
    };

    try {
      unsubscribe = transport.subscribe({
        onLine: (raw) => {
          if (settled) return;
          const line = String(raw ?? '').trim();
          if (!line) return;
          transcript.push(line);
          if (!line.toLowerCase().startsWith('bestmove ')) return;
          try {
            const parsed = parseUciTranscript(transcript, {
              multiPv: limits.multiPv,
              legalMoves,
              terminal: position.terminal,
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
      transport.send(positionCommand(position));
      transport.send(`go depth ${limits.depth}`);
    } catch (err) {
      finish(() => fail(err));
    }
  });
}
