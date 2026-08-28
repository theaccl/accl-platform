import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import {
  EngineFailure,
  START_FEN,
  chessAnalysisFromEngineResult,
  evaluatePositionWithStockfish,
  parsePosition,
  parseUciTranscript,
  type EngineTransport,
} from '@/lib/chess';

function loadFixture(name: string): string[] {
  return readFileSync(join(process.cwd(), 'tests/fixtures/uci', name), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function createScriptedTransport(script: {
  linesOnGo?: string[];
  hang?: boolean;
  crashOnGo?: boolean;
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

test.describe('UCI transcript contract', () => {
  test('MultiPV ranks are unique, bounded, sorted, and legal', () => {
    const position = parsePosition(START_FEN);
    const parsed = parseUciTranscript(loadFixture('multipv-start.txt'), {
      multiPv: 2,
      legalMoves: new Set(position.legalUciMoves),
      terminal: position.terminal,
    });
    expect(parsed.lines.map((line) => line.rank)).toEqual([1, 2]);
    expect(parsed.bestMove).toBe('e2e4');
    expect(parsed.lines[0]?.pv[0]).toBe('e2e4');
    for (const line of parsed.lines) {
      expect(position.legalUciMoves).toContain(line.pv[0]);
    }
  });

  test('bestmove agrees with rank 1', () => {
    const position = parsePosition(START_FEN);
    expect(() =>
      parseUciTranscript(
        ['info depth 8 multipv 1 score cp 10 pv e2e4', 'bestmove d2d4'],
        {
          multiPv: 1,
          legalMoves: new Set(position.legalUciMoves),
          terminal: false,
        }
      )
    ).toThrow(EngineFailure);
  });

  test('bestmove (none) is valid in a terminal position', () => {
    const position = parsePosition(FOOLS_MATE_FEN);
    expect(position.terminal).toBe(true);
    const parsed = parseUciTranscript(loadFixture('terminal-none.txt'), {
      multiPv: 1,
      legalMoves: new Set(position.legalUciMoves),
      terminal: true,
    });
    expect(parsed.bestMove).toBeNull();
    expect(parsed.lines).toEqual([]);
  });

  test('malformed, overflow, duplicate, and contradictory lines fail closed', () => {
    const position = parsePosition(START_FEN);
    const legal = new Set(position.legalUciMoves);
    const opts = { multiPv: 1, legalMoves: legal, terminal: false };

    expect(() => parseUciTranscript(loadFixture('malformed-missing-score.txt'), opts)).toThrow(
      EngineFailure
    );
    expect(() =>
      parseUciTranscript(['info depth 8 multipv 1 score cp 10 pv e2e4'], opts)
    ).toThrow(EngineFailure);
    expect(() =>
      parseUciTranscript(
        ['info depth 8 multipv 2 score cp 10 pv e2e4', 'bestmove e2e4'],
        opts
      )
    ).toThrow(EngineFailure);
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
    });
    expect(result.pov).toBe('white');
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
    });
    expect(result.lines[0]?.score).toEqual({ kind: 'cp', cp: -42 });
  });

  test('preserves mate and never coerces it to centipawns', async () => {
    const white = parsePosition(MATE_WHITE_FEN);
    const whiteResult = await evaluatePositionWithStockfish({
      transport: createScriptedTransport({ linesOnGo: loadFixture('mate-white.txt') }),
      position: white,
      limits: { depth: 8, multiPv: 1 },
    });
    expect(whiteResult.lines[0]?.score).toEqual({ kind: 'mate', mate: 1 });
    expect(whiteResult.lines[0]?.score.kind).not.toBe('cp');

    const black = parsePosition(MATE_BLACK_FEN);
    const blackResult = await evaluatePositionWithStockfish({
      transport: createScriptedTransport({ linesOnGo: loadFixture('mate-black.txt') }),
      position: black,
      limits: { depth: 8, multiPv: 1 },
    });
    expect(blackResult.lines[0]?.score).toEqual({ kind: 'mate', mate: -1 });
  });

  test('rejects raw strings suitable for UCI injection before transport', async () => {
    const transport = createScriptedTransport({ linesOnGo: loadFixture('white-cp-start.txt') });
    expect(() => parsePosition(`${START_FEN}\ngo infinite`)).toThrow();
    expect(transport.commands).toEqual([]);
  });

  test('timeout cleanup occurs exactly once', async () => {
    const position = parsePosition(START_FEN);
    const transport = createScriptedTransport({ hang: true });
    await expect(
      evaluatePositionWithStockfish({
        transport,
        position,
        limits: { depth: 8, multiPv: 1, timeoutMs: 40 },
      })
    ).rejects.toMatchObject({ code: 'ENGINE_TIMEOUT' });
    expect(transport.closeCalls).toBe(1);
  });

  test('crash cleanup occurs exactly once', async () => {
    const position = parsePosition(START_FEN);
    const transport = createScriptedTransport({ crashOnGo: true });
    await expect(
      evaluatePositionWithStockfish({
        transport,
        position,
        limits: { depth: 8, multiPv: 1, timeoutMs: 500 },
      })
    ).rejects.toMatchObject({ code: 'ENGINE_CRASH' });
    expect(transport.closeCalls).toBe(1);
  });
});
