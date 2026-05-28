import type { BadgePressureState, BadgeVisualState } from '@/lib/badgeTracks';
import type { BadgeSettlementEventType } from '@/lib/badgeSettlement';
import type { BadgeEvent, BadgeState, BoundaryStatus } from '@/lib/ratingHistoryTypes';

/** Map backend visual_state to Profile ticker badge labels. */
export function badgeStateFromVisual(visual: BadgeVisualState | null | undefined): BadgeState | null {
  if (!visual) return null;
  if (visual === 'upgraded') return 'shiny';
  if (visual === 'downgraded') return 'downgraded';
  return 'normal';
}

export function boundaryStatusFromBadgeRow(input: {
  visual_state: BadgeVisualState;
  pressure_state: BadgePressureState;
}): BoundaryStatus {
  if (input.visual_state === 'downgraded') {
    return input.pressure_state === 'demotion_armed' ? 'recovery_needed' : 'recovery_needed';
  }
  if (input.pressure_state === 'promotion_armed') return 'upgrade_armed';
  if (input.pressure_state === 'demotion_armed') return 'downgrade_armed';
  return 'safe';
}

export function badgeEventFromSettlementEvent(
  event: BadgeSettlementEventType | null | undefined,
): BadgeEvent {
  switch (event) {
    case 'demotion_armed':
      return 'downgrade_armed';
    case 'demotion_confirmed':
      return 'downgrade_confirmed';
    case 'demotion_pressure_cleared':
      return 'recovered_to_normal';
    case 'downgrade_repaired':
      return 'recovered_to_normal';
    case 'promotion_upgrade':
      return 'upgrade_confirmed';
    case 'streak_upgrade':
      return 'shiny_earned';
    case 'upgrade_lost_on_defeat':
      return 'shiny_lost';
    default:
      return 'none';
  }
}

export function boundaryStatusLabel(status: BoundaryStatus): string {
  switch (status) {
    case 'safe':
      return 'Stable';
    case 'on_the_rise':
      return 'On the rise';
    case 'upgrade_armed':
      return 'Upgrade armed — confirm with another qualifying gain in this track';
    case 'at_risk':
      return 'At risk';
    case 'downgrade_armed':
      return 'Downgrade armed — another qualifying loss in this track may confirm';
    case 'recovery_needed':
      return 'Recovery needed — win in this exact track to restore badge';
    default:
      return status;
  }
}
