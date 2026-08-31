import { expect, test } from '@playwright/test';

import {
  MAJOR_FAMILY_COMPARISON_SERIES,
  buildMajorFamilySeriesData,
  countMajorFamilyInputPoints,
  majorFamilyColorByTrackId,
} from '../../lib/profileRatingChartLevels';
import {
  filterMajorFamilySeriesByLane,
  majorFamilyEmptyTrackIds,
  majorFamilySeriesHasAnyPoints,
  pointsAtExactTimestamp,
} from '../../lib/profileRatingFamilyComparison';
import { filterPointsByLane } from '../../lib/ratingHistoryMetrics';
import type { RatingHistoryPoint } from '../../lib/ratingHistoryTypes';

function point(
  partial: Partial<RatingHistoryPoint> & { id: string; ratingTrackId: string },
): RatingHistoryPoint {
  return {
    playerId: 'u1',
    ecosystem: 'free',
    eventType: 'game',
    result: 'win',
    ratingBefore: 1500,
    ratingAfter: 1510,
    ratingDelta: 10,
    occurredAt: '2026-05-01T12:00:00Z',
    ...partial,
  };
}

test.describe('rating family comparison (unit)', () => {
  test('five major families are registered with stable distinct colors', () => {
    expect(MAJOR_FAMILY_COMPARISON_SERIES.map((s) => s.label)).toEqual([
      'Tournament',
      'Bullet',
      'Blitz',
      'Rapid',
      'Daily',
    ]);
    expect(MAJOR_FAMILY_COMPARISON_SERIES.map((s) => s.trackId)).toEqual([
      'tournament',
      'free_bullet',
      'free_blitz',
      'free_rapid',
      'free_day',
    ]);
    const colors = MAJOR_FAMILY_COMPARISON_SERIES.map((s) => s.color);
    expect(new Set(colors).size).toBe(5);
    expect(majorFamilyColorByTrackId('tournament')).toBe('#eab308');
    expect(MAJOR_FAMILY_COMPARISON_SERIES.find((s) => s.trackId === 'tournament')?.color).toBe(
      '#eab308',
    );
  });

  test('does not include accl alias track', () => {
    expect(MAJOR_FAMILY_COMPARISON_SERIES.map((s) => String(s.trackId)).includes('accl')).toBe(false);
  });

  test('point counts equal input ledger events without synthesis', () => {
    const history = {
      tournament: [point({ id: 't1', ratingTrackId: 'tournament', ratingAfter: 1480 })],
      free_bullet: [
        point({ id: 'b1', ratingTrackId: 'free_bullet' }),
        point({ id: 'b2', ratingTrackId: 'free_bullet', occurredAt: '2026-05-02T12:00:00Z' }),
      ],
      free_blitz: [],
      free_rapid: [point({ id: 'r1', ratingTrackId: 'free_rapid' })],
      free_day: [],
      accl: [point({ id: 'a1', ratingTrackId: 'tournament', ratingAfter: 1480 })],
    };
    const series = buildMajorFamilySeriesData(history);
    expect(countMajorFamilyInputPoints(series)).toBe(4);
    expect(series.find((s) => s.trackId === 'free_blitz')?.points).toHaveLength(0);
    expect(series.find((s) => s.trackId === 'tournament')?.points).toHaveLength(1);
    expect(series.find((s) => s.trackId === 'free_bullet')?.points).toHaveLength(2);
  });

  test('sparse family remains sparse after lane filter', () => {
    const now = Date.parse('2026-05-10T12:00:00Z');
    const history = {
      free_blitz: [
        point({
          id: 'old',
          ratingTrackId: 'free_blitz',
          occurredAt: '2026-01-01T12:00:00Z',
        }),
        point({
          id: 'recent',
          ratingTrackId: 'free_blitz',
          occurredAt: '2026-05-09T12:00:00Z',
        }),
      ],
      tournament: [],
    };
    const series = filterMajorFamilySeriesByLane(buildMajorFamilySeriesData(history), 'week', now, 'UTC');
    const blitz = series.find((s) => s.trackId === 'free_blitz');
    expect(blitz?.points.map((p) => p.id)).toEqual(['recent']);
    expect(majorFamilyEmptyTrackIds(series)).toContain('tournament');
  });

  test('time-window filters apply per family independently', () => {
    const pts = [
      point({ id: 'g1', ratingTrackId: 'free_rapid', occurredAt: '2026-05-01T12:00:00Z' }),
      point({ id: 'g2', ratingTrackId: 'free_rapid', occurredAt: '2026-05-20T12:00:00Z' }),
    ];
    const filtered = filterPointsByLane(pts, 'month', Date.parse('2026-05-25T12:00:00Z'), 'UTC');
    expect(filtered.map((p) => p.id)).toEqual(['g1', 'g2']);
    const dayOnly = filterPointsByLane(pts, 'day', Date.parse('2026-05-20T12:00:00Z'), 'UTC');
    expect(dayOnly.map((p) => p.id)).toEqual(['g2']);
  });

  test('hover bucket returns only exact timestamp matches', () => {
    const series = buildMajorFamilySeriesData({
      free_bullet: [
        point({ id: 'b1', ratingTrackId: 'free_bullet', occurredAt: '2026-05-01T12:00:00Z' }),
      ],
      free_blitz: [
        point({ id: 'z1', ratingTrackId: 'free_blitz', occurredAt: '2026-05-02T12:00:00Z' }),
      ],
    });
    const visible = new Set(['free_bullet', 'free_blitz', 'free_rapid']);
    const atT1 = pointsAtExactTimestamp(series, '2026-05-01T12:00:00Z', visible);
    expect(atT1).toHaveLength(1);
    expect(atT1[0].trackId).toBe('free_bullet');
    const atT2 = pointsAtExactTimestamp(series, '2026-05-02T12:00:00Z', visible);
    expect(atT2).toHaveLength(1);
    expect(atT2[0].trackId).toBe('free_blitz');
    expect(pointsAtExactTimestamp(series, '2026-05-01T12:00:00Z', new Set(['free_rapid']))).toHaveLength(
      0,
    );
  });

  test('empty families are reported honestly', () => {
    const series = buildMajorFamilySeriesData({ free_day: [] });
    expect(majorFamilySeriesHasAnyPoints(series)).toBe(false);
    expect(majorFamilyEmptyTrackIds(series)).toHaveLength(5);
  });
});
