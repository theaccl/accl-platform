/**
 * Pure, ledger-derived metric + filter helpers for the Profile rating ticker.
 *
 * Phase 1 doctrine:
 *  - Operates only over already-loaded authoritative `RatingHistoryPoint[]`.
 *  - No Supabase calls, no mutation, no fabricated values, deterministic output.
 *  - Lane tabs are chart-window filters only; they never create separate ratings
 *    and never touch Elo / settlement / the ledger writer.
 */

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

const DAY_MS = 24 * 60 * 60 * 1000;

function sortChronological(points: RatingHistoryPoint[]): RatingHistoryPoint[] {
  return [...points].sort(
    (a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
  );
}

function isSameLocalDay(timeMs: number, nowMs: number): boolean {
  const d = new Date(timeMs);
  const n = new Date(nowMs);
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}

/** Trailing-window start (inclusive) for week/month/year. */
function laneTrailingStartMs(lane: RatingLane, nowMs: number): number {
  if (lane === 'week') return nowMs - 7 * DAY_MS;
  if (lane === 'month') return nowMs - 30 * DAY_MS;
  if (lane === 'year') {
    const d = new Date(nowMs);
    d.setFullYear(d.getFullYear() - 1);
    return d.getTime();
  }
  return nowMs;
}

/**
 * Lane filter (view window only):
 *  - day:     points whose local calendar date equals `now`'s local date
 *  - week:    trailing 7 days  [now-7d, now]
 *  - month:   trailing 30 days [now-30d, now]
 *  - year:    trailing 12 months [now-1y, now]
 *  - overall: every loaded point
 * Lower/upper bounds inclusive; invalid timestamps are dropped.
 */
export function filterPointsByLane(
  points: RatingHistoryPoint[],
  lane: RatingLane,
  now: number = Date.now(),
): RatingHistoryPoint[] {
  if (lane === 'overall') return [...points];
  return points.filter((p) => {
    const t = Date.parse(p.occurredAt);
    if (!Number.isFinite(t)) return false;
    if (lane === 'day') return isSameLocalDay(t, now);
    const start = laneTrailingStartMs(lane, now);
    return t >= start && t <= now;
  });
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
