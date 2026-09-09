/**
 * Pure, ledger-derived metric + filter helpers for the Profile rating ticker.
 *
 * Phase 1 doctrine:
 *  - Operates only over already-loaded authoritative `RatingHistoryPoint[]`.
 *  - No Supabase calls, no mutation, no fabricated values, deterministic output.
 *  - Lane tabs are chart-window filters only; they never create separate ratings
 *    and never touch Elo / settlement / the ledger writer.
 */

import { ratingLaneWindow } from '@/lib/profile/ratingTickerCalendar';
import {
  resolveTimeZone,
  RATING_TICKER_DISPLAY_TIME_ZONE,
} from '@/lib/profile/ratingTickerTimeZone';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';

export type RatingLane = 'day' | 'week' | 'month' | 'year' | 'overall';
export type RatingResultFilter = 'all' | 'wins' | 'losses' | 'draws';

export const RATING_LANES: RatingLane[] = ['day', 'week', 'month', 'year', 'overall'];
export const DEFAULT_RATING_LANE: RatingLane = 'month';

export const RATING_LANE_LABELS: Record<RatingLane, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  year: 'Year',
  overall: 'Overall',
};

export const RATING_RESULT_FILTERS: RatingResultFilter[] = ['all', 'wins', 'losses', 'draws'];

export const RATING_RESULT_FILTER_LABELS: Record<RatingResultFilter, string> = {
  all: 'All',
  wins: 'Wins',
  losses: 'Losses',
  draws: 'Draws',
};

export type WinLossDrawCounts = { wins: number; losses: number; draws: number };
export type CurrentStreak = { kind: 'win' | 'loss' | 'draw'; length: number };

function sortChronological(points: RatingHistoryPoint[]): RatingHistoryPoint[] {
  return [...points].sort(
    (a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
  );
}

/**
 * Lane filter (view window only). Product calls default to fixed UTC; tests and
 * specialist callers may explicitly inject another valid IANA zone:
 *  - day:     UTC calendar day containing `now`
 *  - week:    ISO 8601 Monday–Sunday containing `now`
 *  - month:   calendar month containing `now`
 *  - year:    calendar year containing `now`
 *  - overall: every loaded point with a valid timestamp
 * Start inclusive, end exclusive. Invalid timestamps are dropped.
 * Does not create ratings or touch Elo / settlement / the ledger writer.
 */
export function filterPointsByLane(
  points: RatingHistoryPoint[],
  lane: RatingLane,
  now: number = Date.now(),
  timeZone: string = RATING_TICKER_DISPLAY_TIME_ZONE,
): RatingHistoryPoint[] {
  if (lane === 'overall') {
    return points.filter((p) => Number.isFinite(Date.parse(p.occurredAt)));
  }
  const tz = resolveTimeZone(timeZone);
  const window = ratingLaneWindow(lane, now, tz);
  if (!window) return [];
  return points.filter((p) => {
    const t = Date.parse(p.occurredAt);
    if (!Number.isFinite(t)) return false;
    return t >= window.startMs && t < window.endMs;
  });
}

/** Last real ratingAfter strictly before `startMs`. Null when no prior event exists. */
export function lastRatingAfterBefore(
  points: RatingHistoryPoint[],
  startMs: number,
): number | null {
  const prior = sortChronological(points).filter((p) => {
    const t = Date.parse(p.occurredAt);
    return Number.isFinite(t) && t < startMs;
  });
  if (prior.length === 0) return null;
  return prior[prior.length - 1].ratingAfter;
}

/** Result filter (chart only). `all` passes through; decisive filters exclude `event_settlement`. */
export function filterPointsByResult(
  points: RatingHistoryPoint[],
  filter: RatingResultFilter,
): RatingHistoryPoint[] {
  if (filter === 'all') return [...points];
  const want = filter === 'wins' ? 'win' : filter === 'losses' ? 'loss' : 'draw';
  return points.filter((p) => p.result === want);
}

/** Latest point's rating (chronological). Null when empty. */
export function currentRatingFromPoints(points: RatingHistoryPoint[]): number | null {
  const sorted = sortChronological(points);
  return sorted.length ? sorted[sorted.length - 1].ratingAfter : null;
}

export function peakRatingFromPoints(points: RatingHistoryPoint[]): number | null {
  if (points.length === 0) return null;
  return points.reduce((m, p) => (p.ratingAfter > m ? p.ratingAfter : m), points[0].ratingAfter);
}

export function lowestRatingFromPoints(points: RatingHistoryPoint[]): number | null {
  if (points.length === 0) return null;
  return points.reduce((m, p) => (p.ratingAfter < m ? p.ratingAfter : m), points[0].ratingAfter);
}

/** Net movement across the window: last.ratingAfter - first.ratingBefore. Null when empty. */
export function laneMovementFromPoints(points: RatingHistoryPoint[]): number | null {
  const sorted = sortChronological(points);
  if (sorted.length === 0) return null;
  return sorted[sorted.length - 1].ratingAfter - sorted[0].ratingBefore;
}

export function winLossDrawCounts(points: RatingHistoryPoint[]): WinLossDrawCounts {
  let wins = 0;
  let losses = 0;
  let draws = 0;
  for (const p of points) {
    if (p.result === 'win') wins += 1;
    else if (p.result === 'loss') losses += 1;
    else if (p.result === 'draw') draws += 1;
  }
  return { wins, losses, draws };
}

/** Decisive+draw win rate (0..1). Null when there are no decisive/draw games. */
export function winRateFromPoints(points: RatingHistoryPoint[]): number | null {
  const { wins, losses, draws } = winLossDrawCounts(points);
  const total = wins + losses + draws;
  if (total === 0) return null;
  return wins / total;
}

/** Longest consecutive run of wins (chronological). 0 when no wins. */
export function bestStreakFromPoints(points: RatingHistoryPoint[]): number {
  const sorted = sortChronological(points);
  let best = 0;
  let current = 0;
  for (const p of sorted) {
    if (p.result === 'win') {
      current += 1;
      if (current > best) best = current;
    } else if (p.result === 'loss' || p.result === 'draw') {
      current = 0;
    }
    // event_settlement points do not extend or break a win streak
  }
  return best;
}

/** Trailing run of identical decisive/draw results. Null when no decisive/draw games. */
export function currentStreakFromPoints(points: RatingHistoryPoint[]): CurrentStreak | null {
  const decisive = sortChronological(points).filter(
    (p) => p.result === 'win' || p.result === 'loss' || p.result === 'draw',
  );
  if (decisive.length === 0) return null;
  const kind = decisive[decisive.length - 1].result as CurrentStreak['kind'];
  let length = 0;
  for (let i = decisive.length - 1; i >= 0; i -= 1) {
    if (decisive[i].result === kind) length += 1;
    else break;
  }
  return { kind, length };
}

export type RatingLaneMetrics = {
  current: number | null;
  peak: number | null;
  lowest: number | null;
  movement: number | null;
  games: number;
  counts: WinLossDrawCounts;
  winRate: number | null;
  bestStreak: number;
  currentStreak: CurrentStreak | null;
};

/** Convenience aggregate for the detail-panel headline row. Pure. */
export function summarizeLaneMetrics(points: RatingHistoryPoint[]): RatingLaneMetrics {
  return {
    current: currentRatingFromPoints(points),
    peak: peakRatingFromPoints(points),
    lowest: lowestRatingFromPoints(points),
    movement: laneMovementFromPoints(points),
    games: points.length,
    counts: winLossDrawCounts(points),
    winRate: winRateFromPoints(points),
    bestStreak: bestStreakFromPoints(points),
    currentStreak: currentStreakFromPoints(points),
  };
}
