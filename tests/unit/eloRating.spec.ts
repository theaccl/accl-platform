import { test, expect } from '@playwright/test';

import {
  clampRating,
  computeEloOutcome,
  eloDelta,
  expectedScore,
  kFactorForGamesPlayed,
  roundHalfAwayFromZero,
  scoreFromResultSide,
  RATING_CEILING,
  RATING_FLOOR,
  STARTING_RATING,
} from '../../lib/eloRating';

test.describe('eloRating — constants', () => {
  test('starting rating stays 1000 for this slice', () => {
    expect(STARTING_RATING).toBe(1000);
    expect(RATING_FLOOR).toBe(100);
    expect(RATING_CEILING).toBe(4000);
  });
});

test.describe('eloRating — expected score', () => {
  test('equal ratings → 0.5', () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5, 10);
  });

  test('symmetry: EA + EB = 1', () => {
    const a = expectedScore(1632, 1488);
    const b = expectedScore(1488, 1632);
    expect(a + b).toBeCloseTo(1, 10);
  });

  test('+400 favorite ≈ 0.909', () => {
    expect(expectedScore(1600, 1200)).toBeCloseTo(0.909, 3);
  });
});

test.describe('eloRating — K-factor schedule', () => {
  test('very new (<8) → 40', () => {
    expect(kFactorForGamesPlayed(0)).toBe(40);
    expect(kFactorForGamesPlayed(7)).toBe(40);
  });

  test('provisional (8–25) → 32', () => {
    expect(kFactorForGamesPlayed(8)).toBe(32);
    expect(kFactorForGamesPlayed(25)).toBe(32);
  });

  test('established (>=26) → 20', () => {
    expect(kFactorForGamesPlayed(26)).toBe(20);
    expect(kFactorForGamesPlayed(500)).toBe(20);
  });

  test('boundary 7 → 8 flips 40 → 32', () => {
    expect(kFactorForGamesPlayed(7)).toBe(40);
    expect(kFactorForGamesPlayed(8)).toBe(32);
  });

  test('boundary 25 → 26 flips 32 → 20', () => {
    expect(kFactorForGamesPlayed(25)).toBe(32);
    expect(kFactorForGamesPlayed(26)).toBe(20);
  });
});

test.describe('eloRating — rounding (half away from zero, matches Postgres)', () => {
  test('positive half rounds away from zero', () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
    expect(roundHalfAwayFromZero(0.5)).toBe(1);
  });

  test('negative half rounds away from zero', () => {
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
    expect(roundHalfAwayFromZero(-0.5)).toBe(-1);
  });

  test('non-half values round normally', () => {
    expect(roundHalfAwayFromZero(2.4)).toBe(2);
    expect(roundHalfAwayFromZero(-2.4)).toBe(-2);
  });
});

test.describe('eloRating — delta behavior', () => {
  test('equal ratings decisive at K=20 → about +/-10', () => {
    expect(eloDelta(1500, 1500, 1, 20)).toBe(10);
    expect(eloDelta(1500, 1500, 0, 20)).toBe(-10);
  });

  test('equal ratings draw at K=20 → 0', () => {
    expect(eloDelta(1500, 1500, 0.5, 20)).toBe(0);
  });

  test('1600 beats 1200 → small gain, not +10', () => {
    const d = eloDelta(1600, 1200, 1, 20);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(10);
  });

  test('1200 beats 1600 → large gain, not +10', () => {
    const d = eloDelta(1200, 1600, 1, 20);
    expect(d).toBeGreaterThan(10);
  });

  test('1600 draws 1200 → 1600 loses points', () => {
    expect(eloDelta(1600, 1200, 0.5, 20)).toBeLessThan(0);
  });

  test('1200 draws 1600 → 1200 gains points', () => {
    expect(eloDelta(1200, 1600, 0.5, 20)).toBeGreaterThan(0);
  });

  test('zero-sum with equal K (decisive)', () => {
    const w = eloDelta(1632, 1488, 1, 20);
    const b = eloDelta(1488, 1632, 0, 20);
    expect(w + b).toBe(0);
  });

  test('zero-sum with equal K (draw, unequal players)', () => {
    const w = eloDelta(1600, 1200, 0.5, 20);
    const b = eloDelta(1200, 1600, 0.5, 20);
    expect(w + b).toBe(0);
  });
});

test.describe('eloRating — score mapping', () => {
  test('win/draw/loss → 1/0.5/0', () => {
    expect(scoreFromResultSide('win')).toBe(1);
    expect(scoreFromResultSide('draw')).toBe(0.5);
    expect(scoreFromResultSide('loss')).toBe(0);
  });
});

test.describe('eloRating — clamps', () => {
  test('floor clamp', () => {
    expect(clampRating(50)).toBe(RATING_FLOOR);
  });

  test('ceiling clamp', () => {
    expect(clampRating(5000)).toBe(RATING_CEILING);
  });

  test('in-range untouched', () => {
    expect(clampRating(1500)).toBe(1500);
  });
});

test.describe('eloRating — full outcome (raw vs clamped)', () => {
  test('established equal win', () => {
    const o = computeEloOutcome({ ratingSelf: 1500, ratingOpponent: 1500, side: 'win', gamesPlayedSelf: 30 });
    expect(o.kFactor).toBe(20);
    expect(o.deltaRaw).toBe(10);
    expect(o.ratingAfter).toBe(1510);
    expect(o.deltaClamped).toBe(10);
  });

  test('very new player uses K=40', () => {
    const o = computeEloOutcome({ ratingSelf: 1500, ratingOpponent: 1500, side: 'win', gamesPlayedSelf: 0 });
    expect(o.kFactor).toBe(40);
    expect(o.deltaRaw).toBe(20);
  });

  test('floor clamp makes deltaClamped differ from deltaRaw', () => {
    // Near-floor favorite loses with high K → raw delta would cross the floor.
    const o = computeEloOutcome({ ratingSelf: 120, ratingOpponent: 100, side: 'loss', gamesPlayedSelf: 0 });
    expect(o.kFactor).toBe(40);
    expect(o.deltaRaw).toBeLessThan(0);
    expect(o.ratingAfter).toBe(RATING_FLOOR);
    expect(o.deltaClamped).toBe(RATING_FLOOR - 120);
    expect(o.deltaClamped).not.toBe(o.deltaRaw);
  });
});
