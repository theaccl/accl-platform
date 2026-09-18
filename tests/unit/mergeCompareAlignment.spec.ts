import { expect, test } from '@playwright/test';

import {
  mergeAlignedTimestamp,
  mergeCalendarFraction,
  mergeRatingAtPosition,
  mergeSourceTimestampAtFraction,
} from '../../lib/profile/mergeCompareAlignment';
import type { RatingHistoryPoint } from '../../lib/ratingHistoryTypes';

function point(id: string, occurredAt: string, ratingAfter: number): RatingHistoryPoint {
  return {
    id,
    playerId: 'p1',
    ratingTrackId: 'accl',
    ecosystem: 'free',
    eventType: 'game',
    result: 'win',
    ratingBefore: ratingAfter - 10,
    ratingAfter,
    ratingDelta: 10,
    occurredAt,
  };
}

test.describe('R042 merge calendar alignment', () => {
  test('aligns equal calendar positions without changing original events', () => {
    const august = { startMs: Date.parse('2026-08-01T00:00:00Z'), endMs: Date.parse('2026-09-01T00:00:00Z') };
    const september = { startMs: Date.parse('2026-09-01T00:00:00Z'), endMs: Date.parse('2026-10-01T00:00:00Z') };
    const augMidday = Date.parse('2026-08-16T12:00:00Z');
    const fraction = mergeCalendarFraction(augMidday, august);

    expect(fraction).toBe(0.5);
    expect(mergeAlignedTimestamp(augMidday, august, september, 'month')).toBe(
      Date.parse('2026-09-16T00:00:00Z'),
    );
    expect(mergeSourceTimestampAtFraction(fraction, august, september, 'month')).toBe(augMidday);
  });

  test('Year alignment keeps month position across leap and non-leap years', () => {
    const leapYear = { startMs: Date.parse('2024-01-01T00:00:00Z'), endMs: Date.parse('2025-01-01T00:00:00Z') };
    const normalYear = { startMs: Date.parse('2025-01-01T00:00:00Z'), endMs: Date.parse('2026-01-01T00:00:00Z') };
    const source = Date.parse('2024-03-01T00:00:00Z');

    expect(mergeAlignedTimestamp(source, leapYear, normalYear, 'year')).toBe(
      Date.parse('2025-03-01T00:00:00Z'),
    );
    const marchFirstFraction =
      (Date.parse('2025-03-01T00:00:00Z') - normalYear.startMs) /
      (normalYear.endMs - normalYear.startMs);
    expect(mergeSourceTimestampAtFraction(marchFirstFraction, leapYear, normalYear, 'year')).toBe(
      source,
    );
  });

  test('Year right endpoint maps to the source year end and includes December events', () => {
    const leapYear = { startMs: Date.parse('2024-01-01T00:00:00Z'), endMs: Date.parse('2025-01-01T00:00:00Z') };
    const normalYear = { startMs: Date.parse('2025-01-01T00:00:00Z'), endMs: Date.parse('2026-01-01T00:00:00Z') };
    const december = point('december', '2024-12-31T18:00:00Z', 1530);
    const nextYear = point('next-year', '2025-01-01T00:00:00Z', 1540);

    expect(mergeSourceTimestampAtFraction(1, leapYear, normalYear, 'year')).toBe(leapYear.endMs);
    const endpoint = mergeRatingAtPosition([december, nextYear], null, leapYear, normalYear, 'year', 1);
    expect(endpoint.mappedMs).toBe(leapYear.endMs - 1);
    expect(endpoint.point?.id).toBe('december');
    expect(endpoint.rating).toBe(1530);
  });

  test('tooltip state uses only real prior events or verified carry-in', () => {
    const window = { startMs: Date.parse('2026-08-01T00:00:00Z'), endMs: Date.parse('2026-09-01T00:00:00Z') };
    const points = [
      point('a', '2026-08-08T00:00:00Z', 1510),
      point('b', '2026-08-24T00:00:00Z', 1520),
    ];

    const beforeFirst = mergeRatingAtPosition(points, 1495, window, window, 'month', 0.1);
    expect(beforeFirst.rating).toBe(1495);
    expect(beforeFirst.point).toBeNull();
    expect(beforeFirst.fromCarryIn).toBe(true);

    const afterFirst = mergeRatingAtPosition(points, 1495, window, window, 'month', 0.5);
    expect(afterFirst.rating).toBe(1510);
    expect(afterFirst.point?.id).toBe('a');
    expect(afterFirst.fromCarryIn).toBe(false);

    const unknown = mergeRatingAtPosition(points, null, window, window, 'month', 0.1);
    expect(unknown.rating).toBeNull();
    expect(unknown.fromCarryIn).toBe(false);
  });
});
