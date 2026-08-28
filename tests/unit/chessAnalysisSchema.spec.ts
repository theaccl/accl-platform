import { expect, test } from '@playwright/test';

import {
  CHESS_ANALYSIS_SCHEMA_VERSION,
  START_FEN,
  parseChessAnalysis,
  parsePosition,
  safeParseChessAnalysis,
} from '@/lib/chess';

function validDocument(overrides: Record<string, unknown> = {}) {
  const position = parsePosition(START_FEN);
  return {
    schemaVersion: CHESS_ANALYSIS_SCHEMA_VERSION,
    pov: 'white',
    position: {
      engineFen: position.engineFen,
      positionKey: position.positionKey,
      turn: position.turn,
      terminal: position.terminal,
    },
    engine: { name: 'stockfish', version: '18.0.7' },
    search: { depth: 12, multiPv: 1, timeoutMs: 1000 },
    bestMove: 'e2e4',
    lines: [
      {
        rank: 1,
        move: 'e2e4',
        pv: ['e2e4', 'e7e5'],
        score: { kind: 'cp', cp: 25 },
        depth: 12,
      },
    ],
    ...overrides,
  };
}

test.describe('chess analysis schema', () => {
  test('accepts a shareable chess-truth document', () => {
    const parsed = parseChessAnalysis(validDocument());
    expect(parsed.pov).toBe('white');
    expect(parsed.schemaVersion).toBe(CHESS_ANALYSIS_SCHEMA_VERSION);
  });

  test('reserves an optional wdl score arm without requiring it', () => {
    const parsed = parseChessAnalysis(
      validDocument({
        lines: [
          {
            rank: 1,
            move: 'e2e4',
            pv: ['e2e4'],
            score: { kind: 'wdl', win: 400, draw: 200, loss: 400 },
            depth: 12,
          },
        ],
      })
    );
    expect(parsed.lines[0]?.score).toEqual({ kind: 'wdl', win: 400, draw: 200, loss: 400 });
  });

  test('rejects missing POV, invalid score unions, and unknown versions', () => {
    const missingPov = validDocument();
    delete (missingPov as { pov?: unknown }).pov;
    expect(safeParseChessAnalysis(missingPov).success).toBe(false);

    expect(
      safeParseChessAnalysis(
        validDocument({
          lines: [
            {
              rank: 1,
              move: 'e2e4',
              pv: ['e2e4'],
              score: { kind: 'cp' },
              depth: 12,
            },
          ],
        })
      ).success
    ).toBe(false);

    expect(safeParseChessAnalysis(validDocument({ schemaVersion: 'fga.engine.structured.1' })).success).toBe(
      false
    );
  });

  test('rejects illegal moves', () => {
    expect(safeParseChessAnalysis(validDocument({ bestMove: 'e2e5' })).success).toBe(false);
    expect(
      safeParseChessAnalysis(
        validDocument({
          lines: [
            {
              rank: 1,
              move: 'e2e5',
              pv: ['e2e5'],
              score: { kind: 'cp', cp: 10 },
              depth: 12,
            },
          ],
        })
      ).success
    ).toBe(false);
  });

  test('rejects missing rank 1, rank above MultiPV, and illegal PV continuations', () => {
    expect(
      safeParseChessAnalysis(
        validDocument({
          bestMove: 'd2d4',
          search: { depth: 12, multiPv: 2, timeoutMs: 1000 },
          lines: [
            {
              rank: 2,
              move: 'd2d4',
              pv: ['d2d4'],
              score: { kind: 'cp', cp: 10 },
              depth: 12,
            },
          ],
        })
      ).success
    ).toBe(false);

    expect(
      safeParseChessAnalysis(
        validDocument({
          search: { depth: 12, multiPv: 1, timeoutMs: 1000 },
          lines: [
            {
              rank: 2,
              move: 'e2e4',
              pv: ['e2e4'],
              score: { kind: 'cp', cp: 10 },
              depth: 12,
            },
          ],
        })
      ).success
    ).toBe(false);

    expect(
      safeParseChessAnalysis(
        validDocument({
          lines: [
            {
              rank: 1,
              move: 'e2e4',
              pv: ['e2e4', 'e2e4'],
              score: { kind: 'cp', cp: 10 },
              depth: 12,
            },
          ],
        })
      ).success
    ).toBe(false);

    expect(
      safeParseChessAnalysis(
        validDocument({
          lines: [
            {
              rank: 1,
              move: 'e2e4',
              pv: ['e2e4', 'e7e5', 'g1g8'],
              score: { kind: 'cp', cp: 10 },
              depth: 12,
            },
          ],
        })
      ).success
    ).toBe(false);
  });

  test('accepts legal multi-move, castling, and promotion PVs', () => {
    expect(safeParseChessAnalysis(validDocument()).success).toBe(true);

    const castle = parsePosition('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(
      safeParseChessAnalysis(
        validDocument({
          position: {
            engineFen: castle.engineFen,
            positionKey: castle.positionKey,
            turn: castle.turn,
            terminal: castle.terminal,
          },
          bestMove: 'e1g1',
          lines: [
            {
              rank: 1,
              move: 'e1g1',
              pv: ['e1g1'],
              score: { kind: 'cp', cp: 20 },
              depth: 12,
            },
          ],
        })
      ).success
    ).toBe(true);

    const promo = parsePosition('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    expect(
      safeParseChessAnalysis(
        validDocument({
          position: {
            engineFen: promo.engineFen,
            positionKey: promo.positionKey,
            turn: promo.turn,
            terminal: promo.terminal,
          },
          bestMove: 'a7a8q',
          lines: [
            {
              rank: 1,
              move: 'a7a8q',
              pv: ['a7a8q'],
              score: { kind: 'cp', cp: 800 },
              depth: 12,
            },
          ],
        })
      ).success
    ).toBe(true);
  });

  test('rejects player, session, and persona fields', () => {
    expect(safeParseChessAnalysis(validDocument({ player: { id: 'p1' } })).success).toBe(false);
    expect(safeParseChessAnalysis(validDocument({ session: { id: 's1' } })).success).toBe(false);
    expect(safeParseChessAnalysis(validDocument({ persona: 'albert' })).success).toBe(false);
    expect(safeParseChessAnalysis(validDocument({ role: 'ALBERT_ASSISTANT' })).success).toBe(false);
  });
});
