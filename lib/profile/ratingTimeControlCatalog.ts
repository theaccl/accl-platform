import type { RatingMode } from '@/lib/profile/ratingDashboardTypes';

export type TimeControlDef = {
  id: string;
  label: string;
  timeControl: string;
};

/** UI catalog for drill-down rows. Per-TC ratings/history require future data — not faked here. */
export const RATING_TIME_CONTROLS: Record<Exclude<RatingMode, 'accl'>, TimeControlDef[]> = {
  tournament: [{ id: 'tournament-overall', label: 'Tournament Overall', timeControl: 'overall' }],
  bullet: [
    { id: 'bullet-overall', label: 'Bullet Overall', timeControl: 'overall' },
    { id: 'bullet-1-0', label: '1+0', timeControl: '1+0' },
    { id: 'bullet-1-1', label: '1+1', timeControl: '1+1' },
    { id: 'bullet-2-1', label: '2+1', timeControl: '2+1' },
  ],
  blitz: [
    { id: 'blitz-overall', label: 'Blitz Overall', timeControl: 'overall' },
    { id: 'blitz-3-0', label: '3+0', timeControl: '3+0' },
    { id: 'blitz-3-2', label: '3+2', timeControl: '3+2' },
    { id: 'blitz-5-0', label: '5+0', timeControl: '5+0' },
    { id: 'blitz-5-5', label: '5+5', timeControl: '5+5' },
  ],
  rapid: [
    { id: 'rapid-overall', label: 'Rapid Overall', timeControl: 'overall' },
    { id: 'rapid-10-0', label: '10+0', timeControl: '10+0' },
    { id: 'rapid-10-5', label: '10+5', timeControl: '10+5' },
    { id: 'rapid-15-10', label: '15+10', timeControl: '15+10' },
    { id: 'rapid-30-0', label: '30+0', timeControl: '30+0' },
  ],
  daily: [
    { id: 'daily-overall', label: 'Daily Overall', timeControl: 'overall' },
    { id: 'daily-1d', label: '1 day', timeControl: '1d' },
    { id: 'daily-2d', label: '2 days', timeControl: '2d' },
    { id: 'daily-3d', label: '3 days', timeControl: '3d' },
  ],
};

export function modeLabel(mode: RatingMode): string {
  switch (mode) {
    case 'accl':
      return 'ACCL Rating';
    case 'tournament':
      return 'Tournament Rating';
    case 'bullet':
      return 'Bullet';
    case 'blitz':
      return 'Blitz';
    case 'rapid':
      return 'Rapid';
    case 'daily':
      return 'Daily';
    default:
      return mode;
  }
}
