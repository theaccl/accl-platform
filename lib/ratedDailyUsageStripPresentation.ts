import type {
  RatedDailyPositionState,
  RatedDailyQueueSlot,
  RatedDailyTodayPosition,
  RatedDailyUsageStripSnapshot,
  RatedDailyUsageStripVariant,
} from '@/lib/ratedDailyUsageStripTypes';
import { isPaidRatedDailyUsageSnapshot } from '@/lib/ratedDailyUsageStripTypes';

export function positionDotLabel(state: RatedDailyPositionState): string {
  switch (state) {
    case 'committed':
      return 'Committed rated Daily opportunity';
    case 'waiting':
      return 'Waiting rated Daily public seat';
    default:
      return 'Available rated Daily opportunity';
  }
}

export function positionDotGlyph(state: RatedDailyPositionState): string {
  switch (state) {
    case 'committed':
      return '●';
    case 'waiting':
      return '◐';
    default:
      return '○';
  }
}

export function queueSlotDotGlyph(state: RatedDailyQueueSlot['state']): string {
  return state === 'waiting' ? '◐' : '○';
}

export function formatRatedDailyResetHint(resetAt: string): string {
  return 'resets 00:00 UTC';
}

export function formatCarryoverExpireHint(carryoverExpiresAt: string): string {
  void carryoverExpiresAt;
  return 'expire 00:00 UTC';
}

export function freeTodaySummary(snapshot: Extract<RatedDailyUsageStripSnapshot, { entitlement_rated_play_unlock: false }>): string {
  return `${snapshot.today_committed_count} committed · ${snapshot.today_waiting_count} waiting · ${snapshot.today_available_count} available`;
}

export function paidTodayQueueSummary(snapshot: Extract<RatedDailyUsageStripSnapshot, { entitlement_rated_play_unlock: true }>): string {
  return `${snapshot.today_waiting_count} of ${snapshot.today_queue_allowance} waiting · reusable as seats are accepted`;
}

export function orderedFreePositions(positions: RatedDailyTodayPosition[]): RatedDailyTodayPosition[] {
  const byNo = new Map(positions.map((p) => [p.position_no, p]));
  return [1, 2, 3, 4, 5].map(
    (position_no) => byNo.get(position_no) ?? { position_no, state: 'empty' as const },
  );
}

export function orderedPaidQueueSlots(slots: RatedDailyQueueSlot[]): RatedDailyQueueSlot[] {
  const byNo = new Map(slots.map((s) => [s.slot_no, s]));
  return Array.from({ length: 10 }, (_, index) => {
    const slot_no = index + 1;
    return byNo.get(slot_no) ?? { slot_no, state: 'empty' as const };
  });
}

export function shouldShowCarryoverStripe(carryoverWaitingCount: number, variant: RatedDailyUsageStripVariant): boolean {
  if (carryoverWaitingCount <= 0) return false;
  return variant !== 'chip';
}

export function shouldShowOngoingCount(ongoingCount: number, variant: RatedDailyUsageStripVariant): boolean {
  if (ongoingCount <= 0) return false;
  if (variant === 'chip') return false;
  return true;
}

export function shouldShowPendingChallenges(variant: RatedDailyUsageStripVariant): boolean {
  return variant === 'full';
}

export function shouldShowLegacyNotice(legacyCount: number): boolean {
  return legacyCount > 0;
}

export function stripHeading(snapshot: RatedDailyUsageStripSnapshot): string {
  return isPaidRatedDailyUsageSnapshot(snapshot) ? 'RATED DAILY QUEUE — TODAY' : 'RATED DAILY — TODAY';
}

export function carryoverHeading(): string {
  return 'OPEN FROM YESTERDAY';
}

export function ongoingHeading(): string {
  return 'ONGOING RATED DAILY GAMES';
}

export function pendingHeading(): string {
  return 'PENDING RATED DAILY CHALLENGES';
}

export function paidUnlockHeading(): string {
  return 'RATED PLAY UNLOCK';
}

export function paidUnlockBody(): string {
  return 'Unlimited Daily rated acceptance';
}
