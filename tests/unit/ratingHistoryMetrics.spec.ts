import { expect, test } from '@playwright/test';

import type { RatingHistoryPoint } from '../../lib/ratingHistoryTypes';
import {
  bestStreakFromPoints,
  currentRatingFromPoints,
  currentStreakFromPoints,
  filterPointsByLane,
  filterPointsByResult,
  laneMovementFromPoints,
  lowestRatingFromPoints,
  peakRatingFromPoints,
  summarizeLaneMetrics,
  winLossDrawCounts,
  winRateFromPoints,
} from '../../lib/ratingHistoryMetrics';

let seq = 0;
function pt(overrides: Partial<RatingHistoryPoint> = {}): RatingHistoryPoint {
  seq += 1;
  const before = overrides.ratingBefore ?? 1500;
  const after = overrides.ratingAfter ?? before;
  return {
    id: overrides.id ?? `p${seq}`,
    playerId: 'u1',
    ratingTrackId: 'free_blitz',
    ecosystem: 'free',
    eventType: 'game',
    result: 'win',
    ratingBefore: before,
    ratingAfter: after,
    ratingDelta: after - before,
    occurredAt: '2026-05-01T12:00:00Z',
    ...overrides,
  };
}

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-05-15T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

test.describe('ratingHistoryMetrics — lane filtering', () => {
  test('day includes current-local-day points only', () => {
    const today = pt({ id: 'today', occurredAt: iso(NOW) });
    const twoDaysAgo = pt({ id: 'old', occurredAt: iso(NOW - 2 * DAY) });
    const out = filterPointsByLane([today, twoDaysAgo], 'day', NOW);
    expect(out.map((p) => p.id)).toEqual(['today']);
  });

  test('week includes trailing 7 days (lower boundary inclusive)', () => {
    const inWindow = pt({ id: 'in', occurredAt: iso(NOW - 3 * DAY) });
    const atBoundary = pt({ id: 'edge', occurredAt: iso(NOW - 7 * DAY) });
    const justOutside = pt({ id: 'out', occurredAt: iso(NOW - 7 * DAY - 1) });
    const out = filterPointsByLane([inWindow, atBoundary, justOutside], 'week', NOW);
    expect(out.map((p) => p.id).sort()).toEqual(['edge', 'in']);
  });

  test('month includes trailing 30 days', () => {
    const inW = pt({ id: 'in', occurredAt: iso(NOW - 20 * DAY) });
    const out = pt({ id: 'out', occurredAt: iso(NOW - 40 * DAY) });
    expect(filterPointsByLane([inW, out], 'month', NOW).map((p) => p.id)).toEqual(['in']);
  });

  test('year includes trailing 12 months', () => {
    const inW = pt({ id: 'in', occurredAt: iso(NOW - 100 * DAY) });
    const out = pt({ id: 'out', occurredAt: iso(NOW - 500 * DAY) });
    expect(filterPointsByLane([inW, out], 'year', NOW).map((p) => p.id)).toEqual(['in']);
  });

  test('overall includes all points', () => {
    const a = pt({ id: 'a', occurredAt: iso(NOW - 500 * DAY) });
    const b = pt({ id: 'b', occurredAt: iso(NOW) });
    expect(filterPointsByLane([a, b], 'overall', NOW)).toHaveLength(2);
  });

  test('empty list returns empty list for every lane', () => {
    for (const lane of ['day', 'week', 'month', 'year', 'overall'] as const) {
      expect(filterPointsByLane([], lane, NOW)).toEqual([]);
    }
  });

  test('does not mutate input', () => {
    const input = [pt({ id: 'a', occurredAt: iso(NOW) })];
    filterPointsByLane(input, 'overall', NOW);
    expect(input).toHaveLength(1);
  });
});

test.describe('ratingHistoryMetrics — result filtering', () => {
  const points = [
    pt({ id: 'w', result: 'win' }),
    pt({ id: 'l', result: 'loss' }),
    pt({ id: 'd', result: 'draw' }),
    pt({ id: 'e', result: 'event_settlement' }),
  ];

  test('all returns all points', () => {
    expect(filterPointsByResult(points, 'all')).toHaveLength(4);
  });
  test('wins returns wins only', () => {
    expect(filterPointsByResult(points, 'wins').map((p) => p.id)).toEqual(['w']);
  });
  test('losses returns losses only', () => {
    expect(filterPointsByResult(points, 'losses').map((p) => p.id)).toEqual(['l']);
  });
  test('draws returns draws only', () => {
    expect(filterPointsByResult(points, 'draws').map((p) => p.id)).toEqual(['d']);
  });
});

test.describe('ratingHistoryMetrics — metrics', () => {
  test('empty array is safe', () => {
    expect(currentRatingFromPoints([])).toBeNull();
    expect(peakRatingFromPoints([])).toBeNull();
    expect(lowestRatingFromPoints([])).toBeNull();
    expect(laneMovementFromPoints([])).toBeNull();
    expect(winLossDrawCounts([])).toEqual({ wins: 0, losses: 0, draws: 0 });
    expect(winRateFromPoints([])).toBeNull();
    expect(bestStreakFromPoints([])).toBe(0);
    expect(currentStreakFromPoints([])).toBeNull();
  });

  test('single point', () => {
    const p = [pt({ ratingBefore: 1500, ratingAfter: 1512, result: 'win', occurredAt: iso(NOW) })];
    expect(currentRatingFromPoints(p)).toBe(1512);
    expect(peakRatingFromPoints(p)).toBe(1512);
    expect(lowestRatingFromPoints(p)).toBe(1512);
    expect(laneMovementFromPoints(p)).toBe(12);
    expect(winRateFromPoints(p)).toBe(1);
    expect(bestStreakFromPoints(p)).toBe(1);
    expect(currentStreakFromPoints(p)).toEqual({ kind: 'win', length: 1 });
  });

  test('multiple wins', () => {
    const p = [
      pt({ ratingBefore: 1500, ratingAfter: 1510, result: 'win', occurredAt: iso(NOW - 3 * DAY) }),
      pt({ ratingBefore: 1510, ratingAfter: 1525, result: 'win', occurredAt: iso(NOW - 2 * DAY) }),
      pt({ ratingBefore: 1525, ratingAfter: 1540, result: 'win', occurredAt: iso(NOW - 1 * DAY) }),
    ];
    expect(bestStreakFromPoints(p)).toBe(3);
    expect(currentStreakFromPoints(p)).toEqual({ kind: 'win', length: 3 });
    expect(laneMovementFromPoints(p)).toBe(40);
    expect(winRateFromPoints(p)).toBe(1);
  });

  test('multiple losses', () => {
    const p = [
      pt({ ratingBefore: 1500, ratingAfter: 1490, result: 'loss', occurredAt: iso(NOW - 2 * DAY) }),
      pt({ ratingBefore: 1490, ratingAfter: 1480, result: 'loss', occurredAt: iso(NOW - 1 * DAY) }),
    ];
    expect(winRateFromPoints(p)).toBe(0);
    expect(bestStreakFromPoints(p)).toBe(0);
    expect(currentStreakFromPoints(p)).toEqual({ kind: 'loss', length: 2 });
  });

  test('all draws', () => {
    const p = [
      pt({ ratingBefore: 1500, ratingAfter: 1500, result: 'draw', occurredAt: iso(NOW - 2 * DAY) }),
      pt({ ratingBefore: 1500, ratingAfter: 1500, result: 'draw', occurredAt: iso(NOW - 1 * DAY) }),
    ];
    expect(winRateFromPoints(p)).toBe(0);
    expect(bestStreakFromPoints(p)).toBe(0);
    expect(currentStreakFromPoints(p)).toEqual({ kind: 'draw', length: 2 });
  });

  test('mixed results: peak, low, movement, counts, win rate, streaks', () => {
    const p = [
      pt({ id: 'a', ratingBefore: 1500, ratingAfter: 1520, result: 'win', occurredAt: iso(NOW - 5 * DAY) }),
      pt({ id: 'b', ratingBefore: 1520, ratingAfter: 1545, result: 'win', occurredAt: iso(NOW - 4 * DAY) }),
      pt({ id: 'c', ratingBefore: 1545, ratingAfter: 1505, result: 'loss', occurredAt: iso(NOW - 3 * DAY) }),
      pt({ id: 'd', ratingBefore: 1505, ratingAfter: 1505, result: 'draw', occurredAt: iso(NOW - 2 * DAY) }),
      pt({ id: 'e', ratingBefore: 1505, ratingAfter: 1530, result: 'win', occurredAt: iso(NOW - 1 * DAY) }),
    ];
    expect(peakRatingFromPoints(p)).toBe(1545);
    expect(lowestRatingFromPoints(p)).toBe(1505);
    expect(laneMovementFromPoints(p)).toBe(30); // 1530 - 1500
    expect(winLossDrawCounts(p)).toEqual({ wins: 3, losses: 1, draws: 1 });
    expect(winRateFromPoints(p)).toBeCloseTo(3 / 5, 5);
    expect(bestStreakFromPoints(p)).toBe(2); // a,b
    expect(currentStreakFromPoints(p)).toEqual({ kind: 'win', length: 1 }); // trailing e
  });

  test('event_settlement is neutral for streaks and win rate denominator', () => {
    const p = [
      pt({ id: 'a', result: 'win', occurredAt: iso(NOW - 2 * DAY) }),
      pt({ id: 'b', result: 'win', occurredAt: iso(NOW - 1 * DAY) }),
      pt({ id: 'e', result: 'event_settlement', occurredAt: iso(NOW) }),
    ];
    expect(winLossDrawCounts(p)).toEqual({ wins: 2, losses: 0, draws: 0 });
    expect(winRateFromPoints(p)).toBe(1); // denominator excludes event_settlement
    expect(currentStreakFromPoints(p)).toEqual({ kind: 'win', length: 2 });
  });

  test('summarizeLaneMetrics aggregates without throwing on empty', () => {
    const m = summarizeLaneMetrics([]);
    expect(m.games).toBe(0);
    expect(m.current).toBeNull();
    expect(m.counts).toEqual({ wins: 0, losses: 0, draws: 0 });
  });
});
