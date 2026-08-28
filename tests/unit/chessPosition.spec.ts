import { expect, test } from '@playwright/test';

import {
  MAX_FEN_LENGTH,
  START_FEN,
  parsePosition,
  PositionParseError,
} from '@/lib/chess';
import { fenBoardKey } from '@/lib/replay/gameReplayIntegrity';

const WHITE_TO_MOVE = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
const SAME_WITHOUT_EP = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const BLACK_TO_MOVE = WHITE_TO_MOVE;

test.describe('chess position parser', () => {
  test('parses the starting position', () => {
    const parsed = parsePosition(START_FEN);
    expect(parsed.turn).toBe('w');
    expect(parsed.engineFen.split(' ')).toHaveLength(6);
    expect(parsed.positionKey.split(' ')).toHaveLength(4);
    expect(parsed.terminal).toBe(false);
    expect(parsed.legalUciMoves).toContain('e2e4');
  });

  test('parses White-to-move and Black-to-move FENs', () => {
    expect(parsePosition(START_FEN).turn).toBe('w');
    expect(parsePosition(BLACK_TO_MOVE).turn).toBe('b');
  });

  test('canonicalizes whitespace and keeps move counters on engine FEN', () => {
    const messy = `  ${START_FEN.replace(/ /g, '   ')}  `;
    const parsed = parsePosition(messy);
    expect(parsed.engineFen).toBe(START_FEN);
    expect(parsed.positionKey).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
  });

  test('position key includes en passant and excludes move counters', () => {
    const withEp = parsePosition(WHITE_TO_MOVE);
    const withoutEp = parsePosition(SAME_WITHOUT_EP);
    expect(withEp.positionKey).toContain('e3');
    expect(withoutEp.positionKey.endsWith('-')).toBe(true);
    expect(withEp.positionKey).not.toBe(withoutEp.positionKey);
    expect(withEp.positionKey.split(' ')).toHaveLength(4);
    expect(withEp.engineFen.split(' ')[4]).toBe('0');
    expect(withEp.engineFen.split(' ')[5]).toBe('1');
  });

  test('does not change replay three-field equivalence', () => {
    expect(fenBoardKey(WHITE_TO_MOVE)).toBe(fenBoardKey(SAME_WITHOUT_EP));
    expect(parsePosition(WHITE_TO_MOVE).positionKey).not.toBe(parsePosition(SAME_WITHOUT_EP).positionKey);
  });

  test('rejects empty, control-character, and oversized input', () => {
    expect(() => parsePosition('')).toThrow(PositionParseError);
    expect(() => parsePosition('   ')).toThrow(PositionParseError);
    expect(() => parsePosition(`${START_FEN}\n go infinite`)).toThrow(PositionParseError);
    expect(() => parsePosition(`\u0000${START_FEN}`)).toThrow(PositionParseError);
    expect(() => parsePosition('a'.repeat(MAX_FEN_LENGTH + 1))).toThrow(PositionParseError);
  });

  test('rejects invalid ranks, pieces, side, castling, and en passant', () => {
    expect(() => parsePosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP w KQkq - 0 1')).toThrow(
      PositionParseError
    );
    expect(() => parsePosition('xnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toThrow(
      PositionParseError
    );
    expect(() => parsePosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1')).toThrow(
      PositionParseError
    );
    expect(() => parsePosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkqX - 0 1')).toThrow(
      PositionParseError
    );
    expect(() => parsePosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq z9 0 1')).toThrow(
      PositionParseError
    );
  });
});
