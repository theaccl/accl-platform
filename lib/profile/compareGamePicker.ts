import { timeControlByRatingTrackId } from '@/lib/acclTimeControls';
import { isRealGameEvent } from '@/lib/profile/compareMode';
import { MAJOR_FAMILY_COMPARISON_SERIES, type MajorFamilyTrackId } from '@/lib/profileRatingChartLevels';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';

export type CompareGameCategoryId = MajorFamilyTrackId;

export const COMPARE_GAME_CATEGORIES: readonly { id: CompareGameCategoryId; label: string }[] = [
  { id: 'free_bullet', label: 'Bullet' },
  { id: 'free_blitz', label: 'Blitz' },
  { id: 'free_rapid', label: 'Rapid' },
  { id: 'free_day', label: 'Daily' },
  { id: 'tournament', label: 'Tournaments' },
];

function modeCategory(mode: RatingHistoryPoint['mode']): CompareGameCategoryId | null {
  if (mode === 'bullet') return 'free_bullet';
  if (mode === 'blitz') return 'free_blitz';
  if (mode === 'rapid') return 'free_rapid';
  if (mode === 'daily') return 'free_day';
  return null;
}

export function compareGameCategory(point: RatingHistoryPoint): CompareGameCategoryId | null {
  if (point.ecosystem === 'tournament' || point.ratingTrackId === 'tournament') return 'tournament';
  const category = MAJOR_FAMILY_COMPARISON_SERIES.find((item) => item.trackId === point.ratingTrackId);
  if (category) return category.trackId;
  const exactMode = timeControlByRatingTrackId(point.ratingTrackId)?.mode;
  return modeCategory(exactMode ?? point.mode);
}

export function mainCompareGameCategory(trackId: string): CompareGameCategoryId | null {
  const category = MAJOR_FAMILY_COMPARISON_SERIES.find((item) => item.trackId === trackId);
  if (category) return category.trackId;
  return modeCategory(timeControlByRatingTrackId(trackId)?.mode);
}

function candidatePriority(point: RatingHistoryPoint): number {
  const category = compareGameCategory(point);
  if (point.ratingTrackId === category) return 0;
  if (category && point.ratingTrackId !== 'accl') return 1;
  return 2;
}

/** One entry per finished game, favoring its broad rating family over ACCL/exact duplicates. */
export function compareGamePickerPoints(
  historyByTrack: Record<string, RatingHistoryPoint[]>,
): RatingHistoryPoint[] {
  const unique = new Map<string, RatingHistoryPoint>();
  for (const point of Object.values(historyByTrack).flat()) {
    if (!isRealGameEvent(point) || !compareGameCategory(point)) continue;
    const key = point.gameId ? `game:${point.gameId}` : `event:${point.id}`;
    const existing = unique.get(key);
    if (!existing || candidatePriority(point) < candidatePriority(existing)) unique.set(key, point);
  }
  return [...unique.values()];
}
