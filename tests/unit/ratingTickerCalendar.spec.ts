import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import {
  isoWeekFromInstant,
  ratingLaneWindow,
  ticksForLaneWindow,
} from '../../lib/profile/ratingTickerCalendar';
import {
  addCivilDays,
  civilDateKey,
  instantToCivil,
  isValidTimeZone,
  resolveTimeZone,
  startOfCivilDayUtcMs,
  zonedCivilToUtcMs,
  formatOccurredAtInZone,
  RATING_TICKER_FALLBACK_TIME_ZONE,
  RATING_TICKER_NONFINITE_INSTANT,
  RATING_TICKER_NONFINITE_CIVIL,
  type CivilDate,
} from '../../lib/profile/ratingTickerTimeZone';
import { filterPointsByLane, lastRatingAfterBefore } from '../../lib/ratingHistoryMetrics';
import type { RatingHistoryPoint } from '../../lib/ratingHistoryTypes';

function point(partial: Partial<RatingHistoryPoint> & { id: string; occurredAt: string }): RatingHistoryPoint {
  return {
    playerId: 'u1',
    ecosystem: 'free',
    eventType: 'game',
    result: 'win',
    ratingTrackId: 'free_blitz',
    ratingBefore: 1000,
    ratingAfter: 1010,
    ratingDelta: 10,
    ...partial,
  };
}

test.describe('rating ticker calendar and timezone helpers', () => {
  test('invalid timezone falls back to Intl, then documented UTC', () => {
    expect(resolveTimeZone('Not/AZone')).toBe(resolveTimeZone());
    expect(resolveTimeZone('UTC')).toBe('UTC');
    expect(resolveTimeZone('America/Chicago')).toBe('America/Chicago');
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(RATING_TICKER_FALLBACK_TIME_ZONE).toBe('UTC');
  });

  test('ISO 2026 W01 W35 and W53 are computed dynamically', () => {
    const w01 = isoWeekFromInstant(Date.parse('2026-01-01T12:00:00Z'), 'UTC');
    expect(w01.isoWeekYear).toBe(2026);
    expect(w01.isoWeek).toBe(1);
    expect(w01.monday).toEqual({ year: 2025, month: 12, day: 29 });
    expect(w01.sunday).toEqual({ year: 2026, month: 1, day: 4 });

    const w35 = isoWeekFromInstant(Date.parse('2026-08-26T12:00:00Z'), 'UTC');
    expect(w35.isoWeekYear).toBe(2026);
    expect(w35.isoWeek).toBe(35);
    expect(w35.monday).toEqual({ year: 2026, month: 8, day: 24 });
    expect(w35.sunday).toEqual({ year: 2026, month: 8, day: 30 });

    const w53 = isoWeekFromInstant(Date.parse('2026-12-30T12:00:00Z'), 'UTC');
    expect(w53.isoWeekYear).toBe(2026);
    expect(w53.isoWeek).toBe(53);
    expect(w53.monday).toEqual({ year: 2026, month: 12, day: 28 });
    expect(w53.sunday).toEqual({ year: 2027, month: 1, day: 3 });
  });

  test('ISO week can span months and years without redefining the Monday–Sunday interval', () => {
    const week09 = isoWeekFromInstant(Date.parse('2026-03-01T12:00:00Z'), 'UTC');
    expect(week09.isoWeek).toBe(9);
    expect(week09.monday).toEqual({ year: 2026, month: 2, day: 23 });
    expect(week09.sunday).toEqual({ year: 2026, month: 3, day: 1 });
    const year = ratingLaneWindow('year', Date.parse('2026-01-02T12:00:00Z'), 'UTC');
    expect(year).not.toBeNull();
    expect(year!.startMs).toBe(Date.parse('2026-01-01T00:00:00Z'));
    expect(year!.endMs).toBe(Date.parse('2027-01-01T00:00:00Z'));
    const w01 = isoWeekFromInstant(Date.parse('2026-01-01T12:00:00Z'), 'UTC');
    expect(w01.startMs).toBeLessThan(year!.startMs);
    expect(w01.monday).toEqual({ year: 2025, month: 12, day: 29 });
  });

  test('leap day stays on 29 February in the resolved zone', () => {
    const civil = instantToCivil(Date.parse('2024-02-29T18:00:00Z'), 'UTC');
    expect(civil).toMatchObject({ year: 2024, month: 2, day: 29 });
    const day = ratingLaneWindow('day', Date.parse('2024-02-29T18:00:00Z'), 'UTC');
    expect(day?.caption).toContain('2024');
    expect(filterPointsByLane(
      [point({ id: 'leap', occurredAt: '2024-02-29T18:00:00Z' })],
      'day',
      Date.parse('2024-02-29T20:00:00Z'),
      'UTC',
    ).map((p) => p.id)).toEqual(['leap']);
  });

  test('DST spring and fall keep civil grouping in America/Chicago', () => {
    const spring = instantToCivil(Date.parse('2026-03-08T08:00:00Z'), 'America/Chicago');
    expect(spring).toMatchObject({ year: 2026, month: 3, day: 8, hour: 3 });
    const fall = instantToCivil(Date.parse('2026-11-01T06:30:00Z'), 'America/Chicago');
    expect(fall).toMatchObject({ year: 2026, month: 11, day: 1 });
  });

  test('late-night UTC instants stay on the player-visible civil day', () => {
    const chicago = instantToCivil(Date.parse('2026-08-27T04:30:00Z'), 'America/Chicago');
    expect(chicago).toMatchObject({ year: 2026, month: 8, day: 26, hour: 23, minute: 30 });
    const day = ratingLaneWindow('day', Date.parse('2026-08-27T04:30:00Z'), 'America/Chicago');
    const pts = [
      point({ id: 'late', occurredAt: '2026-08-27T04:30:00Z' }),
      point({ id: 'next', occurredAt: '2026-08-27T05:30:00Z' }),
    ];
    expect(filterPointsByLane(pts, 'day', Date.parse('2026-08-27T04:45:00Z'), 'America/Chicago').map((p) => p.id)).toEqual([
      'late',
    ]);
    expect(day?.caption).toContain('2026');
  });

  test('month-to-date and year use anchored calendar periods, not trailing durations', () => {
    const now = Date.parse('2026-05-10T12:00:00Z');
    const pts = [
      point({ id: 'april', occurredAt: '2026-04-20T12:00:00Z' }),
      point({ id: 'may', occurredAt: '2026-05-01T12:00:00Z' }),
      point({ id: 'future-may', occurredAt: '2026-05-20T12:00:00Z' }),
    ];
    expect(filterPointsByLane(pts, 'month', now, 'UTC').map((p) => p.id)).toEqual(['may']);
    expect(filterPointsByLane(pts, 'year', now, 'UTC').map((p) => p.id)).toEqual(['april', 'may', 'future-may']);
    const olderYear = point({ id: 'prev', occurredAt: '2025-12-31T12:00:00Z' });
    expect(filterPointsByLane([olderYear, ...pts], 'year', now, 'UTC').map((p) => p.id)).toEqual([
      'april',
      'may',
      'future-may',
    ]);
  });

  test('product lane filtering defaults to UTC at the date boundary', () => {
    const now = Date.parse('2026-08-27T01:00:00Z');
    const pts = [
      point({ id: 'utc-current', occurredAt: '2026-08-27T00:30:00Z' }),
      point({ id: 'utc-previous', occurredAt: '2026-08-26T23:30:00Z' }),
    ];
    expect(filterPointsByLane(pts, 'day', now).map((p) => p.id)).toEqual(['utc-current']);
  });

  test('fixed UTC lanes expose the requested calendar hierarchy', () => {
    const now = Date.parse('2026-08-21T16:30:00Z');
    expect(ratingLaneWindow('day', now, 'UTC')?.caption).toBe(
      '2026 · Aug · ISO W34 · Fri 21 · UTC',
    );
    expect(ratingLaneWindow('week', now, 'UTC')?.caption).toBe(
      '2026 · Aug · ISO W34 · UTC',
    );
    expect(ratingLaneWindow('month', now, 'UTC')?.caption).toBe(
      '2026 · Aug · ISO W31–W34 · UTC',
    );
    expect(ratingLaneWindow('year', now, 'UTC')?.caption).toBe(
      '2026 · Jan–Dec · UTC',
    );

    expect(ticksForLaneWindow(ratingLaneWindow('day', now, 'UTC')!, 720).map((tick) => tick.label)).toEqual([
      '00:00',
      '03:00',
      '06:00',
      '09:00',
      '12:00',
      '15:00',
      '18:00',
      '21:00',
      '24:00',
    ]);
    expect(ticksForLaneWindow(ratingLaneWindow('week', now, 'UTC')!, 720).map((tick) => tick.label)).toEqual([
      'Mon 17',
      'Tue 18',
      'Wed 19',
      'Thu 20',
      'Fri 21',
      'Sat 22',
      'Sun 23',
    ]);

    const month = ratingLaneWindow('month', now, 'UTC')!;
    expect(
      ticksForLaneWindow(month, 720)
        .filter((tick) => tick.priority === 'primary')
        .map((tick) => tick.label),
    ).toEqual(['W32', 'W33', 'W34']);
    expect(
      ticksForLaneWindow(month, 720).filter(
        (tick) => tick.priority === 'secondary' && tick.label === '',
      ).length,
    ).toBe(0);

    expect(
      ratingLaneWindow('month', Date.parse('2025-12-31T12:00:00Z'), 'UTC')?.caption,
    ).toBe('2025 · Dec · ISO 2025-W49–2026-W01 · UTC');

    const overall = ratingLaneWindow('overall', Date.parse('2026-11-15T12:00:00Z'), 'UTC', {
      firstEventMs: Date.parse('2026-08-01T12:00:00Z'),
      lastEventMs: Date.parse('2026-11-15T12:00:00Z'),
    })!;
    const overallTicks = ticksForLaneWindow(overall, 720);
    expect(overallTicks.filter((tick) => tick.priority === 'primary').map((tick) => tick.label)).toEqual([
      'Sep',
      'Oct',
      'Nov',
    ]);
    expect(overallTicks.some((tick) => tick.label.startsWith('W'))).toBe(false);

    const yearTicks = ticksForLaneWindow(ratingLaneWindow('year', now, 'UTC')!, 720);
    expect(yearTicks.filter((tick) => tick.priority === 'primary').map((tick) => tick.label)).toEqual([
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ]);
  });

  test('carry-in uses only the last real pre-window ratingAfter', () => {
    const start = ratingLaneWindow('month', Date.parse('2026-08-15T12:00:00Z'), 'UTC')!.startMs;
    const pts = [
      point({ id: 'a', occurredAt: '2026-06-01T12:00:00Z', ratingAfter: 1000, ratingDelta: 0 }),
      point({ id: 'b', occurredAt: '2026-07-20T12:00:00Z', ratingAfter: 1111, ratingBefore: 1000, ratingDelta: 111 }),
      point({ id: 'c', occurredAt: '2026-08-10T12:00:00Z', ratingAfter: 1120, ratingBefore: 1111, ratingDelta: 9 }),
    ];
    expect(lastRatingAfterBefore(pts, start)).toBe(1111);
    expect(lastRatingAfterBefore(pts, Date.parse('2026-06-01T00:00:00Z'))).toBeNull();
    expect(pts.map((p) => p.id)).toEqual(['a', 'b', 'c']);
    expect(pts[1].ratingAfter).toBe(1111);
  });

  test('responsive tick density keeps both endpoints', () => {
    const week = ratingLaneWindow('week', Date.parse('2026-08-26T12:00:00Z'), 'UTC')!;
    const narrow = ticksForLaneWindow(week, 220);
    const wide = ticksForLaneWindow(week, 720);
    const ends = (ticks: typeof narrow) => ticks.filter((t) => t.priority === 'endpoint');
    expect(ends(narrow)).toHaveLength(2);
    expect(ends(wide)).toHaveLength(2);
    expect(wide.length).toBeGreaterThanOrEqual(narrow.length);
    const day = ratingLaneWindow('day', Date.parse('2026-08-26T12:00:00Z'), 'UTC')!;
    const dayEnds = ticksForLaneWindow(day, 180).filter((t) => t.priority === 'endpoint');
    expect(dayEnds).toHaveLength(2);
    expect(dayEnds.map((t) => t.label)).toEqual(['00:00', '24:00']);
  });

  test('overall without events does not invent a start date', () => {
    expect(ratingLaneWindow('overall', Date.parse('2026-08-26T12:00:00Z'), 'UTC', { firstEventMs: null })).toBeNull();
  });
});

const MIDNIGHT_SEARCH_ZONES = [
  'America/Santiago',
  'America/Asuncion',
  'America/Sao_Paulo',
  'Pacific/Apia',
  'America/Havana',
  'Atlantic/Azores',
  'Africa/Cairo',
  'Asia/Amman',
  'Asia/Beirut',
] as const;

function naiveMidnightUtcMs(date: CivilDate, timeZone: string): number {
  return zonedCivilToUtcMs(date.year, date.month, date.day, 0, 0, 0, timeZone);
}

function findBackwardMidnightGap(fromYear: number, toYear: number) {
  for (const tz of MIDNIGHT_SEARCH_ZONES) {
    if (!isValidTimeZone(tz)) continue;
    for (let year = fromYear; year <= toYear; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const dim = new Date(Date.UTC(year, month, 0)).getUTCDate();
        for (let day = 1; day <= dim; day += 1) {
          const date = { year, month, day };
          const naive = naiveMidnightUtcMs(date, tz);
          const civil = instantToCivil(naive, tz);
          if (civilDateKey(civil) < civilDateKey(date)) {
            return { tz, date, naive, civil };
          }
        }
      }
    }
  }
  return null;
}

function assertExclusiveCivilDay(date: CivilDate, tz: string) {
  const start = startOfCivilDayUtcMs(date, tz);
  const nextDate = addCivilDays(date, 1);
  const next = startOfCivilDayUtcMs(nextDate, tz);
  const prev = startOfCivilDayUtcMs(addCivilDays(date, -1), tz);
  const target = civilDateKey(date);
  expect(civilDateKey(instantToCivil(start, tz))).toBe(target);
  expect(civilDateKey(instantToCivil(start, tz))).not.toBe(civilDateKey(addCivilDays(date, -1)));
  expect(prev).toBeLessThan(start);
  expect(start).toBeLessThan(next);
  expect(civilDateKey(instantToCivil(next - 1, tz))).toBe(target);
  expect(civilDateKey(instantToCivil(next, tz))).toBe(civilDateKey(nextDate));
  const from = start - 3 * 60 * 60 * 1000;
  const to = next + 3 * 60 * 60 * 1000;
  for (let ms = from; ms <= to; ms += 60 * 1000) {
    const civilKey = civilDateKey(instantToCivil(ms, tz));
    if (civilKey === target) {
      expect(ms).toBeGreaterThanOrEqual(start);
      expect(ms).toBeLessThan(next);
    } else if (civilKey < target) {
      expect(ms).toBeLessThan(start);
    } else {
      expect(ms).toBeGreaterThanOrEqual(next);
    }
  }
}

test.describe('rating ticker midnight DST and encoding guards', () => {
  test('nonexistent local midnight starts at the first valid instant of the same civil date', () => {
    const gap = findBackwardMidnightGap(2010, 2012);
    expect(gap, 'expected at least one IANA zone where naive 00:00 maps backward').not.toBeNull();
    const { tz, date, naive, civil } = gap!;
    expect(civilDateKey(civil)).toBeLessThan(civilDateKey(date));
    const start = startOfCivilDayUtcMs(date, tz);
    const startCivil = instantToCivil(start, tz);
    expect(civilDateKey(startCivil)).toBe(civilDateKey(date));
    expect(civilDateKey(startCivil)).not.toBe(civilDateKey(civil));
    expect(start).toBeGreaterThan(naive);
    expect(startCivil.hour + startCivil.minute + startCivil.second).toBeGreaterThan(0);
    assertExclusiveCivilDay(date, tz);
    assertExclusiveCivilDay(addCivilDays(date, -1), tz);
    assertExclusiveCivilDay(addCivilDays(date, 1), tz);
  });

  test('Day endpoint labels use the resolved local boundary, not a hardcoded midnight', () => {
    const gap = findBackwardMidnightGap(2010, 2012);
    expect(gap, 'expected at least one IANA zone where naive 00:00 maps backward').not.toBeNull();
    const { tz, date } = gap!;
    const start = startOfCivilDayUtcMs(date, tz);
    const startCivil = instantToCivil(start, tz);
    expect(startCivil.hour + startCivil.minute + startCivil.second).toBeGreaterThan(0);

    const skipped = ratingLaneWindow('day', start, tz)!;
    const skippedEnds = ticksForLaneWindow(skipped, 720).filter((t) => t.priority === 'endpoint');
    expect(skippedEnds).toHaveLength(2);
    const expectedStart = `${String(startCivil.hour).padStart(2, '0')}:${String(startCivil.minute).padStart(2, '0')}`;
    expect(skippedEnds[0].label).toBe(expectedStart);
    expect(skippedEnds[0].label).not.toBe('00:00');
    const skippedEndCivil = instantToCivil(skipped.endMs, tz);
    if (skippedEndCivil.hour === 0 && skippedEndCivil.minute === 0 && skippedEndCivil.second === 0) {
      expect(skippedEnds[1].label).toBe('24:00');
    } else {
      expect(skippedEnds[1].label).toBe(
        `${String(skippedEndCivil.hour).padStart(2, '0')}:${String(skippedEndCivil.minute).padStart(2, '0')}`,
      );
      expect(skippedEnds[1].label).not.toBe('24:00');
    }

    const previous = ratingLaneWindow('day', startOfCivilDayUtcMs(addCivilDays(date, -1), tz), tz)!;
    const previousEnds = ticksForLaneWindow(previous, 720).filter((t) => t.priority === 'endpoint');
    expect(previousEnds).toHaveLength(2);
    const previousStartCivil = instantToCivil(previous.startMs, tz);
    if (previousStartCivil.hour === 0 && previousStartCivil.minute === 0 && previousStartCivil.second === 0) {
      expect(previousEnds[0].label).toBe('00:00');
    }
    const previousEndCivil = instantToCivil(previous.endMs, tz);
    expect(previous.endMs).toBe(start);
    expect(previousEnds[1].label).not.toBe('24:00');
    expect(previousEnds[1].label).toBe(
      `${String(previousEndCivil.hour).padStart(2, '0')}:${String(previousEndCivil.minute).padStart(2, '0')}`,
    );
    expect(previousEnds[1].label).toBe(expectedStart);

    const ordinary = ratingLaneWindow('day', Date.parse('2026-08-26T12:00:00Z'), 'UTC')!;
    expect(ticksForLaneWindow(ordinary, 720).filter((t) => t.priority === 'endpoint').map((t) => t.label)).toEqual([
      '00:00',
      '24:00',
    ]);
    const chicago = ratingLaneWindow('day', Date.parse('2026-03-08T18:00:00Z'), 'America/Chicago')!;
    expect(instantToCivil(chicago.startMs, 'America/Chicago')).toMatchObject({ hour: 0, minute: 0, second: 0 });
    expect(ticksForLaneWindow(chicago, 720).filter((t) => t.priority === 'endpoint').map((t) => t.label)).toEqual([
      '00:00',
      '24:00',
    ]);
  });

  test('Chicago and New York spring/fall stay on the requested civil date', () => {
    const spring: CivilDate = { year: 2026, month: 3, day: 8 };
    const fall: CivilDate = { year: 2026, month: 11, day: 1 };
    for (const tz of ['America/Chicago', 'America/New_York'] as const) {
      const springStart = startOfCivilDayUtcMs(spring, tz);
      const springEnd = startOfCivilDayUtcMs(addCivilDays(spring, 1), tz);
      expect(civilDateKey(instantToCivil(springStart, tz))).toBe(civilDateKey(spring));
      expect(springStart).toBe(naiveMidnightUtcMs(spring, tz));
      expect(springEnd - springStart).toBe(23 * 60 * 60 * 1000);
      assertExclusiveCivilDay(spring, tz);

      const fallStart = startOfCivilDayUtcMs(fall, tz);
      const fallEnd = startOfCivilDayUtcMs(addCivilDays(fall, 1), tz);
      expect(civilDateKey(instantToCivil(fallStart, tz))).toBe(civilDateKey(fall));
      expect(fallStart).toBe(naiveMidnightUtcMs(fall, tz));
      expect(fallEnd - fallStart).toBe(25 * 60 * 60 * 1000);
      assertExclusiveCivilDay(fall, tz);

      const ordinary: CivilDate = { year: 2026, month: 8, day: 26 };
      const ordinaryStart = startOfCivilDayUtcMs(ordinary, tz);
      expect(ordinaryStart).toBe(naiveMidnightUtcMs(ordinary, tz));
      expect(instantToCivil(ordinaryStart, tz)).toMatchObject({ hour: 0, minute: 0, second: 0 });
    }
  });

  test('ordinary UTC midnight, leap day, and ISO week bounds stay monotonic', () => {
    const utcDay = ratingLaneWindow('day', Date.parse('2026-08-26T12:00:00Z'), 'UTC')!;
    expect(utcDay.startMs).toBe(Date.parse('2026-08-26T00:00:00Z'));
    expect(utcDay.endMs).toBe(Date.parse('2026-08-27T00:00:00Z'));
    const leap = startOfCivilDayUtcMs({ year: 2024, month: 2, day: 29 }, 'UTC');
    expect(instantToCivil(leap, 'UTC')).toMatchObject({ year: 2024, month: 2, day: 29, hour: 0 });
    const w53 = isoWeekFromInstant(Date.parse('2026-12-30T12:00:00Z'), 'UTC');
    expect(w53.isoWeek).toBe(53);
    expect(w53.endMs).toBeGreaterThan(w53.startMs);
  });

  test('non-finite instants are guarded without RangeError or silent date invention', () => {
    expect(() => instantToCivil(Number.NaN, 'UTC')).toThrow(TypeError);
    expect(() => instantToCivil(Number.POSITIVE_INFINITY, 'UTC')).toThrow(TypeError);
    try {
      instantToCivil(Number.NaN, 'UTC');
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(TypeError);
      expect(err).not.toBeInstanceOf(RangeError);
      expect((err as Error).message).toBe(RATING_TICKER_NONFINITE_INSTANT);
    }
    expect(() => zonedCivilToUtcMs(Number.NaN, 1, 1, 0, 0, 0, 'UTC')).toThrow(TypeError);
    expect(() => startOfCivilDayUtcMs({ year: Number.NaN, month: 1, day: 1 }, 'UTC')).toThrow(
      TypeError,
    );
    expect(() => isoWeekFromInstant(Number.NaN, 'UTC')).toThrow(TypeError);
    expect(ratingLaneWindow('day', Number.NaN, 'UTC')).toBeNull();
    expect(formatOccurredAtInZone('not-a-date', 'UTC')).toBe('not-a-date');
    try {
      zonedCivilToUtcMs(Number.NaN, 1, 1, 0, 0, 0, 'UTC');
    } catch (err) {
      expect((err as Error).message).toBe(RATING_TICKER_NONFINITE_CIVIL);
    }
    const mixed = [
      point({ id: 'bad', occurredAt: 'not-a-date' }),
      point({ id: 'ok', occurredAt: '2026-08-26T12:00:00Z' }),
    ];
    expect(filterPointsByLane(mixed, 'overall').map((p) => p.id)).toEqual(['ok']);
    expect(lastRatingAfterBefore(mixed, Date.parse('2026-08-27T00:00:00Z'))).toBe(1010);
    expect(mixed[0].occurredAt).toBe('not-a-date');
  });

  test('candidate production files are UTF-8 without BOM or UTF-16 BOM', () => {
    const files = [
      'lib/ratingHistoryMetrics.ts',
      'lib/profile/ratingTickerCalendar.ts',
      'lib/profile/ratingTickerTimeZone.ts',
      'lib/profile/landscapeTickerPath.ts',
      'lib/profile/landscapeTickerHierarchy.ts',
      'components/profile/ratings/LandscapeRatingTickerChart.tsx',
      'components/profile/ratings/ExpandedRatingTickerDrawer.tsx',
    ];
    for (const rel of files) {
      const buf = readFileSync(join(process.cwd(), rel));
      expect(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf, rel).toBe(false);
      expect(buf[0] === 0xff && buf[1] === 0xfe, rel).toBe(false);
      expect(buf[0] === 0xfe && buf[1] === 0xff, rel).toBe(false);
      expect(buf.toString('utf8').startsWith('\uFEFF'), rel).toBe(false);
    }
  });
});
