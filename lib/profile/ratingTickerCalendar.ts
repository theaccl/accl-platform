/**
 * Calendar / ISO-week windows and responsive time ticks for the landscape ticker.
 * Grouping uses civil dates in the resolved IANA zone. Original ISO timestamps
 * are never rewritten.
 */

import type { RatingLane } from '@/lib/ratingHistoryMetrics';
import {
  addCivilDays,
  instantToCivil,
  resolveTimeZone,
  startOfCivilDayUtcMs,
  zonedCivilToUtcMs,
  RATING_TICKER_NONFINITE_INSTANT,
  type CivilDate,
} from '@/lib/profile/ratingTickerTimeZone';

export type IsoWeekId = {
  isoWeekYear: number;
  isoWeek: number;
  monday: CivilDate;
  sunday: CivilDate;
  startMs: number;
  endMs: number;
};

export type RatingLaneWindow = {
  lane: RatingLane;
  timeZone: string;
  startMs: number;
  endMs: number;
  caption: string;
  isoWeek?: IsoWeekId;
};

export type TimeTick = {
  t: number;
  label: string;
  priority: 'endpoint' | 'primary' | 'secondary';
};

const MONTH_SHORT = [
  'Jan',
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
] as const;

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatCivil(date: CivilDate): string {
  return `${date.year}-${pad2(date.month)}-${pad2(date.day)}`;
}

function formatCivilLong(date: CivilDate): string {
  return `${MONTH_SHORT[date.month - 1]} ${date.day}, ${date.year}`;
}

function monthSpanLabel(start: CivilDate, end: CivilDate): string {
  const first = MONTH_SHORT[start.month - 1];
  const last = MONTH_SHORT[end.month - 1];
  return first === last ? first : `${first}–${last}`;
}

function isoWeekLabel(iso: IsoWeekId): string {
  return `ISO W${pad2(iso.isoWeek)}`;
}

function isoWeekRangeLabel(first: IsoWeekId, last: IsoWeekId): string {
  if (first.isoWeekYear === last.isoWeekYear) {
    return `${isoWeekLabel(first)}–W${pad2(last.isoWeek)}`;
  }
  return `ISO ${first.isoWeekYear}-W${pad2(first.isoWeek)}–${last.isoWeekYear}-W${pad2(last.isoWeek)}`;
}

export function isoWeekFromInstant(ms: number, timeZone: string): IsoWeekId {
  if (!Number.isFinite(ms)) {
    throw new TypeError(RATING_TICKER_NONFINITE_INSTANT);
  }
  const tz = resolveTimeZone(timeZone);
  const civil = instantToCivil(ms, tz);
  const monday = addCivilDays(civil, 1 - civil.isoWeekday);
  const sunday = addCivilDays(monday, 6);
  const thursday = addCivilDays(monday, 3);
  const isoWeekYear = thursday.year;
  const jan4: CivilDate = { year: isoWeekYear, month: 1, day: 4 };
  const jan4Civil = instantToCivil(startOfCivilDayUtcMs(jan4, tz), tz);
  const week1Monday = addCivilDays(jan4, 1 - jan4Civil.isoWeekday);
  const diffDays = Math.round(
    (Date.UTC(monday.year, monday.month - 1, monday.day) -
      Date.UTC(week1Monday.year, week1Monday.month - 1, week1Monday.day)) /
      (24 * 60 * 60 * 1000),
  );
  const isoWeek = Math.floor(diffDays / 7) + 1;
  return {
    isoWeekYear,
    isoWeek,
    monday,
    sunday,
    startMs: startOfCivilDayUtcMs(monday, tz),
    endMs: startOfCivilDayUtcMs(addCivilDays(monday, 7), tz),
  };
}

export function ratingLaneWindow(
  lane: RatingLane,
  nowMs: number,
  timeZone?: string,
  overall?: { firstEventMs: number | null; lastEventMs?: number | null },
): RatingLaneWindow | null {
  if (!Number.isFinite(nowMs)) return null;
  const tz = resolveTimeZone(timeZone);
  if (lane === 'overall') {
    const first = overall?.firstEventMs ?? null;
    if (first == null || !Number.isFinite(first)) return null;
    const last = overall?.lastEventMs;
    const endMs =
      typeof last === 'number' && Number.isFinite(last) ? Math.max(nowMs, last) : nowMs;
    const startCivil = instantToCivil(first, tz);
    const endCivil = instantToCivil(endMs, tz);
    return {
      lane,
      timeZone: tz,
      startMs: first,
      endMs,
      caption: `${formatCivilLong(startCivil)} – ${formatCivilLong(endCivil)} · ${tz}`,
    };
  }

  const now = instantToCivil(nowMs, tz);
  if (lane === 'day') {
    const startMs = startOfCivilDayUtcMs(now, tz);
    const endMs = startOfCivilDayUtcMs(addCivilDays(now, 1), tz);
    const iso = isoWeekFromInstant(nowMs, tz);
    return {
      lane,
      timeZone: tz,
      startMs,
      endMs,
      caption: `${now.year} · ${MONTH_SHORT[now.month - 1]} · ${isoWeekLabel(iso)} · ${WEEKDAY_SHORT[now.isoWeekday - 1]} ${now.day} · ${tz}`,
      isoWeek: iso,
    };
  }
  if (lane === 'week') {
    const iso = isoWeekFromInstant(nowMs, tz);
    return {
      lane,
      timeZone: tz,
      startMs: iso.startMs,
      endMs: iso.endMs,
      caption: `${iso.isoWeekYear} · ${monthSpanLabel(iso.monday, iso.sunday)} · ${isoWeekLabel(iso)} · ${tz}`,
      isoWeek: iso,
    };
  }
  if (lane === 'month') {
    const start: CivilDate = { year: now.year, month: now.month, day: 1 };
    const firstIso = isoWeekFromInstant(startOfCivilDayUtcMs(start, tz), tz);
    const lastIso = isoWeekFromInstant(nowMs, tz);
    return {
      lane,
      timeZone: tz,
      startMs: startOfCivilDayUtcMs(start, tz),
      endMs: nowMs,
      caption: `${now.year} · ${MONTH_SHORT[now.month - 1]} · ${isoWeekRangeLabel(firstIso, lastIso)} · ${tz}`,
    };
  }
  const start: CivilDate = { year: now.year, month: 1, day: 1 };
  const next: CivilDate = { year: now.year + 1, month: 1, day: 1 };
  return {
    lane,
    timeZone: tz,
    startMs: startOfCivilDayUtcMs(start, tz),
    endMs: startOfCivilDayUtcMs(next, tz),
    caption: `${now.year} · Jan–Dec · ${tz}`,
  };
}

function tickWidth(label: string): number {
  return Math.max(12, label.length * 6.2);
}

function fits(
  tick: TimeTick,
  placed: TimeTick[],
  inner: number,
  minT: number,
  maxT: number,
): boolean {
  const span = Math.max(maxT - minT, 1);
  const x = ((tick.t - minT) / span) * inner;
  for (const p of placed) {
    const px = ((p.t - minT) / span) * inner;
    const need = (tickWidth(tick.label) + tickWidth(p.label)) / 2 + 4;
    if (Math.abs(x - px) < need) return false;
  }
  return true;
}

function hourLabel(hour: number): string {
  if (hour === 0) return '00:00';
  if (hour === 12) return '12:00';
  if (hour === 24) return '24:00';
  return `${pad2(hour)}:00`;
}

function isLocalMidnight(civil: { hour: number; minute: number; second: number }): boolean {
  return civil.hour === 0 && civil.minute === 0 && civil.second === 0;
}

/** Day-lane endpoints: 00:00 / 24:00 only when local midnight actually exists. */
function dayBoundaryLabel(ms: number, timeZone: string, role: 'start' | 'end'): string {
  const civil = instantToCivil(ms, timeZone);
  if (isLocalMidnight(civil)) return role === 'start' ? '00:00' : '24:00';
  return `${pad2(civil.hour)}:${pad2(civil.minute)}`;
}

export function ticksForLaneWindow(
  window: RatingLaneWindow,
  innerWidthPx: number,
): TimeTick[] {
  const tz = window.timeZone;
  const { startMs, endMs, lane } = window;
  const start = instantToCivil(startMs, tz);
  const endExclusive = instantToCivil(Math.max(startMs, endMs - 1), tz);
  const candidates: TimeTick[] = [];

  const push = (t: number, label: string, priority: TimeTick['priority']) => {
    if (t < startMs - 1 || t > endMs + 1) return;
    const clamped = Math.min(Math.max(t, startMs), endMs);
    candidates.push({ t: clamped, label, priority });
  };

  push(startMs, lane === 'day' ? dayBoundaryLabel(startMs, tz, 'start') : formatCivil(start), 'endpoint');
  if (lane === 'day') {
    push(endMs, dayBoundaryLabel(endMs, tz, 'end'), 'endpoint');
  } else {
    push(endMs, formatCivil(addCivilDays(endExclusive, lane === 'year' ? 0 : 0)), 'endpoint');
    if (lane === 'week' && window.isoWeek) {
      candidates[0] = {
        t: startMs,
        label: `${WEEKDAY_SHORT[0]} ${window.isoWeek.monday.day}`,
        priority: 'endpoint',
      };
      candidates[1] = {
        t: endMs,
        label: `${WEEKDAY_SHORT[6]} ${window.isoWeek.sunday.day}`,
        priority: 'endpoint',
      };
    }
    if (lane === 'month') {
      candidates[0] = { t: startMs, label: '1', priority: 'endpoint' };
      candidates[1] = {
        t: endMs,
        label: String(endExclusive.day),
        priority: 'endpoint',
      };
    }
    if (lane === 'year') {
      candidates[0] = { t: startMs, label: 'Jan', priority: 'endpoint' };
      candidates[1] = { t: endMs, label: String(endExclusive.year + 1), priority: 'endpoint' };
    }
  }

  if (lane === 'day') {
    const step = innerWidthPx >= 520 ? 3 : innerWidthPx >= 360 ? 6 : 12;
    for (let h = step; h < 24; h += step) {
      const t = zonedHour(start, h, tz);
      push(t, hourLabel(h), h % 6 === 0 ? 'primary' : 'secondary');
    }
  } else if (lane === 'week' && window.isoWeek) {
    for (let i = 1; i < 6; i += 1) {
      const day = addCivilDays(window.isoWeek.monday, i);
      push(
        startOfCivilDayUtcMs(day, tz),
        `${WEEKDAY_SHORT[i]} ${day.day}`,
        innerWidthPx >= 420 ? 'primary' : 'secondary',
      );
    }
  } else if (lane === 'month') {
    let cursor = startOfCivilDayUtcMs(start, tz);
    while (cursor < endMs) {
      const iso = isoWeekFromInstant(cursor, tz);
      if (iso.startMs > startMs && iso.startMs < endMs) {
        push(iso.startMs, `W${pad2(iso.isoWeek)}`, 'primary');
      }
      cursor = iso.endMs;
    }
  } else if (lane === 'year') {
    for (let m = 2; m <= 12; m += 1) {
      const t = startOfCivilDayUtcMs({ year: start.year, month: m, day: 1 }, tz);
      push(t, MONTH_SHORT[m - 1], 'primary');
    }
  } else {
    const spanMs = endMs - startMs;
    const daySpan = spanMs / (24 * 60 * 60 * 1000);
    let cursorCivil: CivilDate = instantToCivil(startMs, tz);
    cursorCivil = cursorCivil.month === 12
      ? { year: cursorCivil.year + 1, month: 1, day: 1 }
      : { year: cursorCivil.year, month: cursorCivil.month + 1, day: 1 };
    let cursor = startOfCivilDayUtcMs(cursorCivil, tz);
    while (cursor < endMs) {
      const isJanuary = cursorCivil.month === 1;
      const label = daySpan <= 800
        ? isJanuary
          ? `Jan ${cursorCivil.year}`
          : MONTH_SHORT[cursorCivil.month - 1]
        : isJanuary
          ? String(cursorCivil.year)
          : '';
      push(cursor, label, label ? 'primary' : 'secondary');
      cursorCivil = cursorCivil.month === 12
        ? { year: cursorCivil.year + 1, month: 1, day: 1 }
        : { year: cursorCivil.year, month: cursorCivil.month + 1, day: 1 };
      cursor = startOfCivilDayUtcMs(cursorCivil, tz);
    }
  }

  const unique = new Map<number, TimeTick>();
  for (const tick of candidates) {
    const prev = unique.get(tick.t);
    if (!prev || rank(tick.priority) < rank(prev.priority)) unique.set(tick.t, tick);
  }
  const all = [...unique.values()].sort((a, b) => a.t - b.t);
  const endpoints = all.filter((t) => t.priority === 'endpoint');
  const placed = [...endpoints];
  const inner = Math.max(innerWidthPx, 40);
  for (const tick of all.filter((t) => t.priority === 'primary')) {
    if (fits(tick, placed, inner, startMs, endMs)) placed.push(tick);
  }
  if (innerWidthPx >= 400) {
    for (const tick of all.filter((t) => t.priority === 'secondary')) {
      if (fits(tick, placed, inner, startMs, endMs)) placed.push(tick);
    }
  }
  placed.sort((a, b) => a.t - b.t);
  if (placed.filter((t) => t.priority === 'endpoint').length < 2 && endpoints.length >= 2) {
    return endpoints;
  }
  return placed;
}

function rank(priority: TimeTick['priority']): number {
  if (priority === 'endpoint') return 0;
  if (priority === 'primary') return 1;
  return 2;
}

function zonedHour(day: CivilDate, hour: number, timeZone: string): number {
  if (hour >= 24) return startOfCivilDayUtcMs(addCivilDays(day, 1), timeZone);
  return zonedCivilToUtcMs(day.year, day.month, day.day, hour, 0, 0, timeZone);
}
