import { test, expect } from '@playwright/test';
import { Chess, type Square } from 'chess.js';

import { canPickPieceForMove, sideToMoveFromBoard } from '../../lib/boardInteraction';

function allSquares(): string[] {
  const out: string[] = [];
  for (const f of 'abcdefgh') for (const r of '12345678') out.push(`${f}${r}`);
  return out;
}

test.describe('boardInteraction', () => {
  test('sideToMoveFromBoard tracks white then black', () => {
    const b = new Chess();
    expect(sideToMoveFromBoard(b)).toBe('white');
    b.move('e4');
    expect(sideToMoveFromBoard(b)).toBe('black');
  });

  test('cannot pick own pieces when not side to move', () => {
    const b = new Chess();
    b.move('e4');
    expect(canPickPieceForMove(b, 'e2', 'white')).toBe(false);
    expect(canPickPieceForMove(b, 'e7', 'black')).toBe(true);
  });

  test('pickable squares match chess.js verbose move origins (in check)', () => {
    const b = new Chess('4k3/8/8/8/8/8/3q4/3K4 w - - 0 1');
    expect(b.isCheck()).toBe(true);
    expect(sideToMoveFromBoard(b)).toBe('white');
    const verbose = b.moves({ verbose: true });
    expect(verbose.length).toBeGreaterThan(0);
    const fromOk = new Set(verbose.map((m) => m.from));
    for (const sq of allSquares()) {
      expect(canPickPieceForMove(b, sq, 'white')).toBe(fromOk.has(sq as Square));
    }
  });
});
