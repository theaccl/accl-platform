import type { RatingMode } from '@/lib/profile/ratingDashboardTypes';

export const RATING_MODE_ACCENTS: Record<
  RatingMode,
  { border: string; glow: string; icon: string; chart: string }
> = {
  accl: {
    border: 'border-violet-500/50',
    glow: 'shadow-violet-500/20',
    icon: 'text-violet-300',
    chart: '#8b5cf6',
  },
  tournament: {
    border: 'border-amber-500/50',
    glow: 'shadow-amber-500/20',
    icon: 'text-amber-300',
    chart: '#f59e0b',
  },
  bullet: {
    border: 'border-yellow-500/45',
    glow: 'shadow-yellow-500/15',
    icon: 'text-yellow-300',
    chart: '#eab308',
  },
  blitz: {
    border: 'border-sky-500/50',
    glow: 'shadow-sky-500/20',
    icon: 'text-sky-300',
    chart: '#38bdf8',
  },
  rapid: {
    border: 'border-emerald-500/45',
    glow: 'shadow-emerald-500/15',
    icon: 'text-emerald-300',
    chart: '#34d399',
  },
  daily: {
    border: 'border-orange-500/45',
    glow: 'shadow-orange-500/15',
    icon: 'text-orange-300',
    chart: '#fb923c',
  },
};

export function formatRating(n: number | null | undefined): string {
  if (typeof n === 'number' && Number.isFinite(n)) return String(Math.round(n));
  return '—';
}

export function formatDelta(n: number | null | undefined): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n) || n === 0) return null;
  return n > 0 ? `+${Math.round(n)}` : String(Math.round(n));
}

export function formatWinRate(wins: number | null, games: number | null): string {
  if (typeof wins !== 'number' || typeof games !== 'number' || games <= 0) return '—';
  return `${((wins / games) * 100).toFixed(1)}%`;
}
