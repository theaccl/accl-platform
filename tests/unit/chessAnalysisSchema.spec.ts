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

  test('rejects player, session, and persona fields', () => {
    expect(safeParseChessAnalysis(validDocument({ player: { id: 'p1' } })).success).toBe(false);
    expect(safeParseChessAnalysis(validDocument({ session: { id: 's1' } })).success).toBe(false);
    expect(safeParseChessAnalysis(validDocument({ persona: 'albert' } )).success).toBe(false);
    expect(safeParseChessAnalysis(validDocument({ role: 'ALBERT_ASSISTANT' })).success).toBe(false);
  });
});
