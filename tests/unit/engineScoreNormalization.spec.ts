import { expect, test } from '@playwright/test';

import { toMoverPov, toWhitePov, type EngineScore } from '@/lib/chess';
import { centipawnToHumanLine } from '@/lib/trainer/formatTrainerEvaluation';

function cp(n: number): EngineScore {
  return { kind: 'cp', cp: n };
}

function mate(n: number): EngineScore {
  return { kind: 'mate', mate: n };
}

test.describe('engine score White-POV normalization', () => {
  test('cp +42: White turn stays +42; Black turn becomes -42', () => {
    expect(toWhitePov(cp(42), 'w')).toEqual(cp(42));
    expect(toWhitePov(cp(42), 'b')).toEqual(cp(-42));
  });

  test('cp -42: White turn stays -42; Black turn becomes +42', () => {
    expect(toWhitePov(cp(-42), 'w')).toEqual(cp(-42));
    expect(toWhitePov(cp(-42), 'b')).toEqual(cp(42));
  });

  test('four-way mate normalization never manufactures centipawns', () => {
    expect(toWhitePov(mate(3), 'w')).toEqual(mate(3));
    expect(toWhitePov(mate(-3), 'w')).toEqual(mate(-3));
    expect(toWhitePov(mate(3), 'b')).toEqual(mate(-3));
    expect(toWhitePov(mate(-3), 'b')).toEqual(mate(3));
    for (const score of [mate(3), mate(-3)]) {
      expect(toWhitePov(score, 'w').kind).toBe('mate');
      expect(toWhitePov(score, 'b').kind).toBe('mate');
    }
  });

  test('mover POV round-trips White POV', () => {
    expect(toMoverPov(toWhitePov(cp(42), 'b'), 'b')).toEqual(cp(42));
    expect(toMoverPov(toWhitePov(mate(2), 'b'), 'b')).toEqual(mate(2));
  });

  test('Trainer wording names White or Black, not side to move', () => {
    expect(centipawnToHumanLine(42, 'w')).toBe('Slight edge for White.');
    expect(centipawnToHumanLine(42, 'b')).toBe('Slight edge for Black.');
    expect(centipawnToHumanLine(-42, 'w')).toBe('Slight edge for Black.');
    expect(centipawnToHumanLine(-42, 'b')).toBe('Slight edge for White.');
    expect(centipawnToHumanLine(42, 'w')).not.toMatch(/side to move/i);
  });
});
