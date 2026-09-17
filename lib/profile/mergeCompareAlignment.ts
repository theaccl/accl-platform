import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';
import type { CompareBucketLane } from '@/lib/profile/compareMode';

export type MergeCalendarWindow = {
  startMs: number;
  endMs: number;
};

export type MergeRatingAtPosition = {
  mappedMs: number;
  rating: number | null;
  point: RatingHistoryPoint | null;
  fromCarryIn: boolean;
};

function windowSpan(window: MergeCalendarWindow): number {
  return Math.max(1, window.endMs - window.startMs);
}

export function mergeCalendarFraction(
  occurredAtMs: number,
  sourceWindow: MergeCalendarWindow,
): number {
  if (!Number.isFinite(occurredAtMs)) return 0;
  return Math.min(1, Math.max(0, (occurredAtMs - sourceWindow.startMs) / windowSpan(sourceWindow)));
}

export function mergeAlignedTimestamp(
  occurredAtMs: number,
  sourceWindow: MergeCalendarWindow,
  targetWindow: MergeCalendarWindow,
  lane: CompareBucketLane,
): number {
  if (lane === 'year') {
    return alignYearCalendarPosition(occurredAtMs, sourceWindow, targetWindow);
  }
  return targetWindow.startMs + mergeCalendarFraction(occurredAtMs, sourceWindow) * windowSpan(targetWindow);
}

export function mergeSourceTimestampAtFraction(
  fraction: number,
  sourceWindow: MergeCalendarWindow,
  targetWindow: MergeCalendarWindow,
  lane: CompareBucketLane,
): number {
  const safeFraction = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  if (lane === 'year') {
    const targetMs = targetWindow.startMs + safeFraction * windowSpan(targetWindow);
    return alignYearCalendarPosition(targetMs, targetWindow, sourceWindow);
  }
  return sourceWindow.startMs + safeFraction * windowSpan(sourceWindow);
}

function utcMonthStart(year: number, month: number): number {
  return Date.UTC(year, month, 1);
}

function alignYearCalendarPosition(
  occurredAtMs: number,
  sourceWindow: MergeCalendarWindow,
  targetWindow: MergeCalendarWindow,
): number {
  if (!Number.isFinite(occurredAtMs)) return targetWindow.startMs;
  const sourceDate = new Date(occurredAtMs);
  const sourceYear = new Date(sourceWindow.startMs).getUTCFullYear();
  const targetYear = new Date(targetWindow.startMs).getUTCFullYear();
  const month = Math.min(11, Math.max(0, sourceDate.getUTCMonth()));
  const sourceMonthStart = utcMonthStart(sourceYear, month);
  const sourceMonthEnd = utcMonthStart(sourceYear, month + 1);
  const monthFraction = Math.min(
    1,
    Math.max(0, (occurredAtMs - sourceMonthStart) / Math.max(1, sourceMonthEnd - sourceMonthStart)),
  );
  const targetMonthStart = utcMonthStart(targetYear, month);
  const targetMonthEnd = utcMonthStart(targetYear, month + 1);
  return targetMonthStart + monthFraction * (targetMonthEnd - targetMonthStart);
}

export function mergeRatingAtPosition(
  points: RatingHistoryPoint[],
  carryInRating: number | null,
  sourceWindow: MergeCalendarWindow,
  targetWindow: MergeCalendarWindow,
  lane: CompareBucketLane,
  fraction: number,
): MergeRatingAtPosition {
  const mappedMs = mergeSourceTimestampAtFraction(fraction, sourceWindow, targetWindow, lane);
  const eligible = points
    .filter((point) => {
      const time = Date.parse(point.occurredAt);
      return Number.isFinite(time) && time >= sourceWindow.startMs && time < sourceWindow.endMs && time <= mappedMs;
    })
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
  const point = eligible[eligible.length - 1] ?? null;
  if (point) {
    return { mappedMs, rating: point.ratingAfter, point, fromCarryIn: false };
  }
  const carry = typeof carryInRating === 'number' && Number.isFinite(carryInRating)
    ? carryInRating
    : null;
  return { mappedMs, rating: carry, point: null, fromCarryIn: carry != null };
}
