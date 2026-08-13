import { expect, test } from '@playwright/test';

import { lastMoveMatchesAuthoritativePosition } from '../../lib/coherentGamePresentation';

const before = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

test.describe('coherent incoming move presentation', () => {
  test('suppresses a move-path highlight while the authoritative board is still old', () => {
    expect(
      lastMoveMatchesAuthoritativePosition(
        { san: 'e4', from_sq: 'e2', to_sq: 'e4', fen_after: afterE4 },
        before
      )
    ).toBe(false);
  });

  test('allows the highlight once the authoritative board and move log agree', () => {
    expect(
      lastMoveMatchesAuthoritativePosition(
        { san: 'e4', from_sq: 'e2', to_sq: 'e4', fen_after: afterE4 },
        `${afterE4.split(' ').slice(0, 4).join(' ')} 8 42`
      )
    ).toBe(true);
  });

  test('fails closed when either side lacks a complete FEN', () => {
    expect(lastMoveMatchesAuthoritativePosition({ san: 'e4', fen_after: null }, afterE4)).toBe(false);
    expect(lastMoveMatchesAuthoritativePosition({ san: 'e4', fen_after: afterE4 }, null)).toBe(false);
  });
});
