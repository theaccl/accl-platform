import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import {
  ENGINE_DEFAULT_TIMEOUT_MS,
  ENGINE_MAX_DEPTH,
  ENGINE_MAX_TIMEOUT_MS,
  ENGINE_MAX_TRANSCRIPT_LINES,
  EngineFailure,
  START_FEN,
  chessAnalysisFromEngineResult,
  evaluatePositionWithStockfish,
  parsePosition,
  parseUciTranscript,
  type EngineIdentity,
  type EngineTransport,
  type EvaluatePositionInput,
  type ParsedPosition,
} from '@/lib/chess';

function loadFixture(name: string): string[] {
  return readFileSync(join(process.cwd(), 'tests/fixtures/uci', name), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

const INJECTED_IDENTITY: EngineIdentity = { name: 'stockfish', version: 'injected-test' };

function transcriptOpts(fen: string, multiPv = 1) {
  return { multiPv, engineFen: parsePosition(fen).engineFen };
}

function createScriptedTransport(script: {
  linesOnGo?: string[];
  hang?: boolean;
  crashOnGo?: boolean;
  floodOnGo?: number;
}): EngineTransport & { closeCalls: number; commands: string[] } {
  const commands: string[] = [];
  let closeCalls = 0;
  let handlers: { onLine: (line: string) => void; onError?: (err: unknown) => void } | null = null;

  const transport: EngineTransport & { closeCalls: number; commands: string[] } = {
    commands,
    get closeCalls() {
      return closeCalls;
    },
    send(command: string) {
      commands.push(command);
      if (!command.startsWith('go ')) return;
      if (script.hang) return;
      queueMicrotask(() => {
        if (script.crashOnGo) {
          handlers?.onError?.(new Error('engine_process_crash'));
          return;
        }
        if (script.floodOnGo) {
          for (let i = 0; i < script.floodOnGo; i += 1) {
            handlers?.onLine(`info depth 1 time 1 nodes ${i + 1}`);
          }
          return;
        }
        for (const line of script.linesOnGo ?? []) {
          handlers?.onLine(line);
        }
      });
    },
    subscribe(next) {
      handlers = next;
      return () => {
        handlers = null;
      };
    },
    close() {
      closeCalls += 1;
    },
  };
  return transport;
}

const MATE_WHITE_FEN = '7k/5Q2/8/8/8/8/8/7K w - - 0 1';
const MATE_BLACK_FEN = '7K/5q2/8/8/8/8/8/7k b - - 0 1';
const FOOLS_MATE_FEN = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
const CASTLE_FEN = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
const PROMO_FEN = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';

test.describe('UCI transcript contract', () => {
  test('MultiPV ranks are unique, bounded, sorted, and legal', () => {
    const parsed = parseUciTranscript(loadFixture('multipv-start.txt'), transcriptOpts(START_FEN, 2));
    expect(parsed.lines.map((line) => line.rank)).toEqual([1, 2]);
    expect(parsed.bestMove).toBe('e2e4');
    expect(parsed.lines[0]?.pv[0]).toBe('e2e4');
  });

  test('bestmove agrees specifically with rank 1', () => {
    expect(() =>
      parseUciTranscript(['info depth 8 multipv 1 score cp 10 pv e2e4', 'bestmove d2d4'], transcriptOpts(START_FEN))
    ).toThrow(EngineFailure);
  });

  test('missing rank 1 fails closed even if bestmove matches rank 2', () => {
    expect(() =>
      parseUciTranscript(
        ['info depth 8 multipv 2 score cp 10 pv d2d4', 'bestmove d2d4'],
        transcriptOpts(START_FEN, 2)
      )
    ).toThrow(/engine_missing_rank1/);
  });

  test('rank greater than MultiPV fails closed', () => {
    expect(() =>
      parseUciTranscript(
        ['info depth 8 multipv 2 score cp 10 pv e2e4', 'bestmove e2e4'],
        transcriptOpts(START_FEN, 1)
      )
    ).toThrow(EngineFailure);
  });

  test('bestmove (none) is valid in a terminal position', () => {
    const position = parsePosition(FOOLS_MATE_FEN);
    expect(position.terminal).toBe(true);
    const parsed = parseUciTranscript(loadFixture('terminal-none.txt'), transcriptOpts(FOOLS_MATE_FEN));
    expect(parsed.bestMove).toBeNull();
    expect(parsed.lines).toEqual([]);
  });

  test('accepts a legal multi-move PV including castling and promotion', () => {
    const start = parseUciTranscript(
      ['info depth 6 multipv 1 score cp 20 pv e2e4 e7e5', 'bestmove e2e4'],
      transcriptOpts(START_FEN)
    );
    expect(start.lines[0]?.pv).toEqual(['e2e4', 'e7e5']);

    const castle = parseUciTranscript(
      ['info depth 6 multipv 1 score cp 30 pv e1g1', 'bestmove e1g1'],
      transcriptOpts(CASTLE_FEN)
    );
    expect(castle.bestMove).toBe('e1g1');

    const promo = parseUciTranscript(
      ['info depth 6 multipv 1 score cp 800 pv a7a8q', 'bestmove a7a8q'],
      transcriptOpts(PROMO_FEN)
    );
    expect(promo.bestMove).toBe('a7a8q');
  });

  test('rejects a legal root move followed by an illegal second or later continuation', () => {
    expect(() =>
      parseUciTranscript(
        ['info depth 6 multipv 1 score cp 10 pv e2e4 e2e4', 'bestmove e2e4'],
        transcriptOpts(START_FEN)
      )
    ).toThrow(/engine_illegal_pv_continuation/);
    expect(() =>
      parseUciTranscript(
        ['info depth 6 multipv 1 score cp 10 pv e2e4 e7e5 g1g8', 'bestmove e2e4'],
        transcriptOpts(START_FEN)
      )
    ).toThrow(/engine_illegal_pv_continuation/);
  });

  test('malformed, overflow, duplicate, and contradictory lines fail closed', () => {
    const opts = transcriptOpts(START_FEN);

    expect(() => parseUciTranscript(loadFixture('malformed-missing-score.txt'), opts)).toThrow(
      EngineFailure
    );
    expect(() => parseUciTranscript(['info depth 8 multipv 1 score cp 10 pv e2e4'], opts)).toThrow(
      EngineFailure
    );
    expect(() =>
      parseUciTranscript(
        [
          'info depth 8 multipv 1 score cp 10 pv e2e4',
          'info depth 8 multipv 1 score cp 12 pv d2d4',
          'bestmove e2e4',
        ],
        opts
      )
    ).toThrow(EngineFailure);
    expect(() =>
      parseUciTranscript(
        ['info depth 8 multipv 1 score cp 10 score mate 2 pv e2e4', 'bestmove e2e4'],
        opts
      )
    ).toThrow(EngineFailure);
  });
});

test.describe('injected Stockfish adapter contract', () => {
  test('normalizes White-to-move cp +42 to White POV +42', async () => {
    const position = parsePosition(START_FEN);
    const transport = createScriptedTransport({ linesOnGo: loadFixture('white-cp-start.txt') });
    const result = await evaluatePositionWithStockfish({
      transport,
      position,
      limits: { depth: 12, multiPv: 1 },
      identity: INJECTED_IDENTITY,
    });
    expect(result.pov).toBe('white');
    expect(result.identity).toEqual(INJECTED_IDENTITY);
    expect(result.lines[0]?.score).toEqual({ kind: 'cp', cp: 42 });
    expect(result.bestMove).toBe('e2e4');
    expect(transport.closeCalls).toBe(1);
    const fenCommand = transport.commands.find((cmd) => cmd.startsWith('position fen '));
    expect(fenCommand).toBe(`position fen ${position.engineFen}`);
    expect(fenCommand).not.toContain('\n');
    expect(chessAnalysisFromEngineResult(result).schemaVersion).toBe('accl.chess.analysis.1');
  });

  test('normalizes Black-to-move cp +42 to White POV -42', async () => {
    const position = parsePosition('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
    const transport = createScriptedTransport({ linesOnGo: loadFixture('black-cp.txt') });
    const result = await evaluatePositionWithStockfish({
      transport,
      position,
      limits: { depth: 10, multiPv: 1 },
      identity: INJECTED_IDENTITY,
    });
    expect(result.lines[0]?.score).toEqual({ kind: 'cp', cp: -42 });
    expect(result.identity.version).toBe('injected-test');
  });

  test('preserves mate and never coerces it to centipawns', async () => {
    const white = parsePosition(MATE_WHITE_FEN);
    const whiteResult = await evaluatePositionWithStockfish({
      transport: createScriptedTransport({ linesOnGo: loadFixture('mate-white.txt') }),
      position: white,
      limits: { depth: 8, multiPv: 1 },
      identity: INJECTED_IDENTITY,
    });
    expect(whiteResult.lines[0]?.score).toEqual({ kind: 'mate', mate: 1 });
    expect(whiteResult.lines[0]?.score.kind).not.toBe('cp');

    const black = parsePosition(MATE_BLACK_FEN);
    const blackResult = await evaluatePositionWithStockfish({
      transport: createScriptedTransport({ linesOnGo: loadFixture('mate-black.txt') }),
      position: black,
      limits: { depth: 8, multiPv: 1 },
      identity: INJECTED_IDENTITY,
    });
    expect(blackResult.lines[0]?.score).toEqual({ kind: 'mate', mate: -1 });
  });

  test('rejects a forged ParsedPosition with newline injection before any command', async () => {
    const transport = createScriptedTransport({ linesOnGo: loadFixture('white-cp-start.txt') });
    const forged = {
      ...parsePosition(START_FEN),
      engineFen: `${START_FEN}\ngo infinite`,
    } as ParsedPosition;
    await expect(
      evaluatePositionWithStockfish({
        transport,
        position: forged,
        limits: { depth: 8, multiPv: 1 },
        identity: INJECTED_IDENTITY,
      })
    ).rejects.toMatchObject({ code: 'INVALID_POSITION' });
    expect(transport.commands).toEqual([]);
    expect(transport.closeCalls).toBe(0);
  });

  test('does not invent Stockfish 18.0.7 for an injected transport', async () => {
    const transport = createScriptedTransport({ linesOnGo: loadFixture('white-cp-start.txt') });
    await expect(
      evaluatePositionWithStockfish({
        transport,
        position: parsePosition(START_FEN),
        limits: { depth: 8, multiPv: 1 },
      } as unknown as EvaluatePositionInput)
    ).rejects.toMatchObject({ message: 'engine_identity_required' });
    expect(transport.commands).toEqual([]);
    expect(transport.closeCalls).toBe(0);
  });

  test('omitted timeout still times out and cleans up once', async () => {
    test.setTimeout(ENGINE_DEFAULT_TIMEOUT_MS + 8_000);
    const transport = createScriptedTransport({ hang: true });
    await expect(
      evaluatePositionWithStockfish({
        transport,
        position: parsePosition(START_FEN),
        limits: { depth: 8, multiPv: 1 },
        identity: INJECTED_IDENTITY,
      })
    ).rejects.toMatchObject({ code: 'ENGINE_TIMEOUT' });
    expect(transport.closeCalls).toBe(1);
  });

  test('excessive depth and timeout are clamped', async () => {
    const transport = createScriptedTransport({ linesOnGo: loadFixture('white-cp-start.txt') });
    const result = await evaluatePositionWithStockfish({
      transport,
      position: parsePosition(START_FEN),
      limits: { depth: 999, multiPv: 1, timeoutMs: 60_000 },
      identity: INJECTED_IDENTITY,
    });
    expect(result.limits.depth).toBe(ENGINE_MAX_DEPTH);
    expect(result.limits.timeoutMs).toBe(ENGINE_MAX_TIMEOUT_MS);
    expect(transport.commands).toContain(`go depth ${ENGINE_MAX_DEPTH}`);
  });

  test('transcript overflow fails closed and cleans up once', async () => {
    const transport = createScriptedTransport({ floodOnGo: ENGINE_MAX_TRANSCRIPT_LINES + 8 });
    await expect(
      evaluatePositionWithStockfish({
        transport,
        position: parsePosition(START_FEN),
        limits: { depth: 8, multiPv: 1, timeoutMs: 500 },
        identity: INJECTED_IDENTITY,
      })
    ).rejects.toMatchObject({ code: 'MALFORMED_UCI', message: 'engine_transcript_overflow' });
    expect(transport.closeCalls).toBe(1);
  });

  test('timeout cleanup occurs exactly once', async () => {
    const transport = createScriptedTransport({ hang: true });
    await expect(
      evaluatePositionWithStockfish({
        transport,
        position: parsePosition(START_FEN),
        limits: { depth: 8, multiPv: 1, timeoutMs: 40 },
        identity: INJECTED_IDENTITY,
      })
    ).rejects.toMatchObject({ code: 'ENGINE_TIMEOUT' });
    expect(transport.closeCalls).toBe(1);
  });

  test('crash cleanup occurs exactly once', async () => {
    const transport = createScriptedTransport({ crashOnGo: true });
    await expect(
      evaluatePositionWithStockfish({
        transport,
        position: parsePosition(START_FEN),
        limits: { depth: 8, multiPv: 1, timeoutMs: 500 },
        identity: INJECTED_IDENTITY,
      })
    ).rejects.toMatchObject({ code: 'ENGINE_CRASH' });
    expect(transport.closeCalls).toBe(1);
  });
});
