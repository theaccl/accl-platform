import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';

/** Visual marker kind for a single chart point (only when authoritative data exists). */
export type ChartPointMarkerKind =
  | 'none'
  | 'streak'
  | 'tournament_settlement'
  | 'shiny_earned'
  | 'shiny_lost'
  | 'downgrade_confirmed'
  | 'recovery'
  | 'upgrade_armed'
  | 'downgrade_armed'
  | 'badge_event';

export type ChartPointMarkerStyle = {
  kind: ChartPointMarkerKind;
  fill: string;
  stroke: string;
  label: string;
  showRing: boolean;
};

const BADGE_EVENT_KIND: Partial<
  Record<NonNullable<RatingHistoryPoint['badgeEvent']>, ChartPointMarkerKind>
> = {
  shiny_earned: 'shiny_earned',
  shiny_lost: 'shiny_lost',
  downgrade_confirmed: 'downgrade_confirmed',
  recovered_to_normal: 'recovery',
  upgrade_armed: 'upgrade_armed',
  downgrade_armed: 'downgrade_armed',
  upgrade_confirmed: 'badge_event',
};

const STYLE: Record<ChartPointMarkerKind, Omit<ChartPointMarkerStyle, 'kind'>> = {
  none: { fill: '#38bdf8', stroke: '#0ea5e9', label: '', showRing: false },
  streak: { fill: '#a78bfa', stroke: '#7c3aed', label: 'Streak', showRing: true },
  tournament_settlement: {
    fill: '#f59e0b',
    stroke: '#d97706',
    label: 'Tournament settlement',
    showRing: true,
  },
  shiny_earned: { fill: '#fde047', stroke: '#eab308', label: 'Shiny earned', showRing: true },
  shiny_lost: { fill: '#94a3b8', stroke: '#64748b', label: 'Shiny lost', showRing: true },
  downgrade_confirmed: {
    fill: '#f87171',
    stroke: '#dc2626',
    label: 'Downgrade',
    showRing: true,
  },
  recovery: { fill: '#4ade80', stroke: '#16a34a', label: 'Recovered', showRing: true },
  upgrade_armed: { fill: '#38bdf8', stroke: '#0284c7', label: 'Upgrade armed', showRing: true },
  downgrade_armed: { fill: '#fb923c', stroke: '#ea580c', label: 'Downgrade armed', showRing: true },
  badge_event: { fill: '#38bdf8', stroke: '#0ea5e9', label: 'Badge event', showRing: true },
};

/**
 * Derive chart marker from authoritative point fields only — never infers from rating delta alone.
 */
export function chartPointMarkerForPoint(point: RatingHistoryPoint): ChartPointMarkerKind {
  if (
    point.eventType === 'tournament_batch' ||
    point.eventType === 'bracket_settlement' ||
    point.result === 'event_settlement'
  ) {
    return 'tournament_settlement';
  }

  const badge = point.badgeEvent;
  if (badge && badge !== 'none' && badge !== 'manual_adjustment') {
    return BADGE_EVENT_KIND[badge] ?? 'badge_event';
  }

  if (
    point.streakAfter != null &&
    point.streakBefore != null &&
    point.streakAfter !== point.streakBefore
  ) {
    return 'streak';
  }

  return 'none';
}

export function chartPointMarkerStyle(
  point: RatingHistoryPoint,
  active: boolean,
): ChartPointMarkerStyle {
  const kind = chartPointMarkerForPoint(point);
  const base = STYLE[kind];
  if (active) {
    return {
      kind,
      fill: '#fbbf24',
      stroke: '#f59e0b',
      label: base.label,
      showRing: base.showRing,
    };
  }
  return { kind, ...base };
}

export function chartPointMarkerLegendKinds(points: RatingHistoryPoint[]): ChartPointMarkerKind[] {
  const seen = new Set<ChartPointMarkerKind>();
  for (const p of points) {
    const k = chartPointMarkerForPoint(p);
    if (k !== 'none') seen.add(k);
  }
  const order: ChartPointMarkerKind[] = [
    'tournament_settlement',
    'shiny_earned',
    'shiny_lost',
    'downgrade_confirmed',
    'recovery',
    'upgrade_armed',
    'downgrade_armed',
    'streak',
    'badge_event',
  ];
  return order.filter((k) => seen.has(k));
}
