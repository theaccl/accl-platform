import { expect, test } from '@playwright/test';

import {
  scoreSuccessfulPerformance,
  successfulPoints,
} from '../../lib/profile/successfulPerformance';
import type { AuthoritativeSourceStatus } from '../../lib/profile/successfulPerformanceTypes';

function agg(
  wins: number,
  draws: number,
  losses: number,
  eligibleGames: number,
  sourceStatus: AuthoritativeSourceStatus = 'available',
) {
  return { wins, draws, losses, eligibleGames, sourceStatus };
}

test.describe('successfulPerformance — scoring formula', () => {
  test('successful points = wins + 0.5 * draws', () => {
    expect(successfulPoints(0, 0)).toBe(0);
    expect(successfulPoints(1, 0)).toBe(1);
    expect(successfulPoints(0, 1)).toBe(0.5);
    expect(successfulPoints(3, 2)).toBe(4);
  });

  test('1 win, 0 draws, 0 losses = 100%', () => {
    const r = scoreSuccessfulPerformance(agg(1, 0, 0, 1));
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.percentage).toBeCloseTo(100, 10);
  });

  test('0 wins, 1 draw, 0 losses = 50%', () => {
    const r = scoreSuccessfulPerformance(agg(0, 1, 0, 1));
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.percentage).toBeCloseTo(50, 10);
  });

  test('0 wins, 0 draws, 1 loss = 0% (ok, not insufficient_data)', () => {
    const r = scoreSuccessfulPerformance(agg(0, 0, 1, 1));
    expect(r.status).toBe('ok');
    if (r.status === 'ok') {
      expect(r.percentage).toBe(0);
      expect(r.successfulPoints).toBe(0);
    }
  });

  test('1 win, 1 loss = 50%', () => {
    const r = scoreSuccessfulPerformance(agg(1, 0, 1, 2));
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.percentage).toBeCloseTo(50, 10);
  });

  test('1 win, 1 draw, 1 loss = 50%', () => {
    const r = scoreSuccessfulPerformance(agg(1, 1, 1, 3));
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.percentage).toBeCloseTo(50, 10);
  });
});

test.describe('successfulPerformance — non-ok outcomes', () => {
  test('zero games = insufficient_data (never 0%)', () => {
    expect(scoreSuccessfulPerformance(agg(0, 0, 0, 0)).status).toBe('insufficient_data');
  });

  test('unavailable source = unavailable (never 0%)', () => {
    const r = scoreSuccessfulPerformance(agg(0, 0, 0, 0, 'unavailable'));
    expect(r.status).toBe('unavailable');
  });

  test('unavailable source dominates even with counts present', () => {
    const r = scoreSuccessfulPerformance(agg(5, 2, 3, 10, 'unavailable'));
    expect(r.status).toBe('unavailable');
  });

  test('inconsistent eligibleGames = invalid (no silent repair)', () => {
    const r = scoreSuccessfulPerformance(agg(1, 0, 0, 2));
    expect(r.status).toBe('invalid');
  });

  test('negative count = invalid', () => {
    expect(scoreSuccessfulPerformance(agg(-1, 0, 0, -1)).status).toBe('invalid');
    expect(scoreSuccessfulPerformance(agg(0, -2, 0, 0)).status).toBe('invalid');
  });

  test('fractional count = invalid', () => {
    expect(scoreSuccessfulPerformance(agg(1.5, 0, 0, 1.5)).status).toBe('invalid');
    expect(scoreSuccessfulPerformance(agg(0, 0.5, 0, 0.5)).status).toBe('invalid');
  });

  test('NaN count = invalid', () => {
    expect(scoreSuccessfulPerformance(agg(Number.NaN, 0, 0, Number.NaN)).status).toBe('invalid');
  });

  test('Infinity count = invalid', () => {
    expect(
      scoreSuccessfulPerformance(agg(Number.POSITIVE_INFINITY, 0, 0, Number.POSITIVE_INFINITY))
        .status,
    ).toBe('invalid');
    expect(
      scoreSuccessfulPerformance(agg(0, 0, Number.NEGATIVE_INFINITY, 0)).status,
    ).toBe('invalid');
  });
});
