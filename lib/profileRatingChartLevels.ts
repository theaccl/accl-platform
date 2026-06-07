/**
 * Centralized major-family comparison chart colors and series registry.
 * Stage 2: mode-scope ledger tracks only (no ACCL Overall alias).
 */

import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';

export type MajorFamilyTrackId =
  | 'tournament'
  | 'free_bullet'
  | 'free_blitz'
  | 'free_rapid'
  | 'free_day';

export type MajorFamilySeriesDef = {
  trackId: MajorFamilyTrackId;
  label: string;
  /** Stroke / marker color (Tournament = gold). */
  color: string;
  legendTestId: string;
};

/** Locked palette for Stage 2 multi-line comparison. */
export const MAJOR_FAMILY_COMPARISON_SERIES: readonly MajorFamilySeriesDef[] = [
  {
    trackId: 'tournament',
    label: 'Tournament',
    color: '#eab308',
    legendTestId: 'major-family-legend-tournament',
  },
  {
    trackId: 'free_bullet',
    label: 'Bullet',
    color: '#f472b6',
    legendTestId: 'major-family-legend-bullet',
  },
  {
    trackId: 'free_blitz',
    label: 'Blitz',
    color: '#fb923c',
    legendTestId: 'major-family-legend-blitz',
  },
  {
    trackId: 'free_rapid',
    label: 'Rapid',
    color: '#38bdf8',
    legendTestId: 'major-family-legend-rapid',
  },
  {
    trackId: 'free_day',
    label: 'Daily',
    color: '#a78bfa',
    legendTestId: 'major-family-legend-daily',
  },
] as const;

export type MajorFamilySeriesData = MajorFamilySeriesDef & {
  points: RatingHistoryPoint[];
};

export function majorFamilyTrackIds(): MajorFamilyTrackId[] {
  return MAJOR_FAMILY_COMPARISON_SERIES.map((s) => s.trackId);
}

export function majorFamilyColorByTrackId(trackId: string): string | null {
  return MAJOR_FAMILY_COMPARISON_SERIES.find((s) => s.trackId === trackId)?.color ?? null;
}

export function buildMajorFamilySeriesData(
  historyByTrack: Record<string, RatingHistoryPoint[]>,
): MajorFamilySeriesData[] {
  return MAJOR_FAMILY_COMPARISON_SERIES.map((def) => ({
    ...def,
    points: [...(historyByTrack[def.trackId] ?? [])].sort((a, b) =>
      a.occurredAt.localeCompare(b.occurredAt),
    ),
  }));
}

/** Sum of authoritative input points — must equal rendered markers (no synthesis). */
export function countMajorFamilyInputPoints(series: MajorFamilySeriesData[]): number {
  return series.reduce((n, s) => n + s.points.length, 0);
}
