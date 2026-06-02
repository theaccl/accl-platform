import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  carryoverHeading,
  freeTodaySummary,
  orderedFreePositions,
  orderedPaidQueueSlots,
  paidTodayQueueSummary,
  positionDotGlyph,
  positionDotLabel,
  shouldShowCarryoverStripe,
  shouldShowOngoingCount,
  stripHeading,
} from '@/lib/ratedDailyUsageStripPresentation';
import {
  defaultFreeTodayPositions,
  defaultPaidQueueSlots,
  parseRatedDailyUsageStripSnapshot,
  type RatedDailyUsageStripSnapshotFree,
  type RatedDailyUsageStripSnapshotPaid,
} from '@/lib/ratedDailyUsageStripTypes';

const FREE_SNAPSHOT: RatedDailyUsageStripSnapshotFree = {
  utc_day: '2026-06-02',
  reset_at: '2026-06-03T00:00:00.000Z',
  entitlement_rated_play_unlock: false,
  today_allowance: 5,
  today_waiting_count: 2,
  today_committed_count: 1,
  today_available_count: 2,
  today_positions: [
    { position_no: 1, state: 'committed' },
    { position_no: 2, state: 'waiting' },
    { position_no: 3, state: 'waiting' },
    { position_no: 4, state: 'empty' },
    { position_no: 5, state: 'empty' },
  ],
  carryover_waiting_count: 3,
  carryover_expires_at: '2026-06-03T00:00:00.000Z',
  ongoing_seated_rated_daily_count: 7,
  pending_sent_rated_daily_challenge_count: 2,
  pending_sent_rated_daily_challenge_cap: 5,
  legacy_unclassified_rated_daily_count: 0,
};

const PAID_SNAPSHOT: RatedDailyUsageStripSnapshotPaid = {
  utc_day: '2026-06-02',
  reset_at: '2026-06-03T00:00:00.000Z',
  entitlement_rated_play_unlock: true,
  today_queue_allowance: 10,
  today_waiting_count: 4,
  today_queue_available_count: 6,
  today_queue_slots: defaultPaidQueueSlots(4),
  carryover_waiting_count: 2,
  carryover_expires_at: '2026-06-03T00:00:00.000Z',
  ongoing_seated_rated_daily_count: 18,
  pending_sent_rated_daily_challenge_count: 3,
  pending_sent_rated_daily_challenge_cap: 10,
  acceptance_unlimited: true,
  legacy_unclassified_rated_daily_count: 0,
};

test.describe('ratedDailyUsageStrip types and presentation', () => {
  test('parseRatedDailyUsageStripSnapshot handles free and paid payloads', () => {
    const free = parseRatedDailyUsageStripSnapshot({
      utc_day: '2026-06-02',
      reset_at: '2026-06-03T00:00:00.000Z',
      entitlement_rated_play_unlock: false,
      today_allowance: 5,
      today_waiting_count: 1,
      today_committed_count: 1,
      today_available_count: 3,
      today_positions: [{ position_no: 1, state: 'committed' }],
      carryover_waiting_count: 0,
      carryover_expires_at: '2026-06-03T00:00:00.000Z',
      ongoing_seated_rated_daily_count: 0,
      pending_sent_rated_daily_challenge_count: 0,
      pending_sent_rated_daily_challenge_cap: 5,
      legacy_unclassified_rated_daily_count: 2,
    });
    expect(free?.entitlement_rated_play_unlock).toBe(false);
    expect(free && 'today_allowance' in free ? free.today_allowance : null).toBe(5);

    const paid = parseRatedDailyUsageStripSnapshot({
      utc_day: '2026-06-02',
      reset_at: '2026-06-03T00:00:00.000Z',
      entitlement_rated_play_unlock: true,
      today_queue_allowance: 10,
      today_waiting_count: 2,
      today_queue_available_count: 8,
      today_queue_slots: [{ slot_no: 1, state: 'waiting' }],
      carryover_waiting_count: 1,
      carryover_expires_at: '2026-06-03T00:00:00.000Z',
      ongoing_seated_rated_daily_count: 5,
      pending_sent_rated_daily_challenge_count: 1,
      pending_sent_rated_daily_challenge_cap: 10,
      acceptance_unlimited: true,
      legacy_unclassified_rated_daily_count: 0,
    });
    expect(paid?.entitlement_rated_play_unlock).toBe(true);
    expect(paid && 'acceptance_unlimited' in paid ? paid.acceptance_unlimited : null).toBe(true);
  });

  test('free full strip renders 5 positions with dot glyphs and summary', () => {
    const positions = orderedFreePositions(FREE_SNAPSHOT.today_positions);
    expect(positions).toHaveLength(5);
    expect(positions.map((p) => positionDotGlyph(p.state)).join(' ')).toBe('● ◐ ◐ ○ ○');
    expect(freeTodaySummary(FREE_SNAPSHOT)).toBe('1 committed · 2 waiting · 2 available');
    expect(stripHeading(FREE_SNAPSHOT)).toBe('RATED DAILY — TODAY');
  });

  test('paid full strip renders 10 queue slots', () => {
    const slots = orderedPaidQueueSlots(PAID_SNAPSHOT.today_queue_slots);
    expect(slots).toHaveLength(10);
    expect(slots.filter((s) => s.state === 'waiting')).toHaveLength(4);
    expect(paidTodayQueueSummary(PAID_SNAPSHOT)).toContain('4 of 10 waiting');
    expect(stripHeading(PAID_SNAPSHOT)).toBe('RATED DAILY QUEUE — TODAY');
  });

  test('position labels are accessible text', () => {
    expect(positionDotLabel('committed')).toContain('Committed');
    expect(positionDotLabel('waiting')).toContain('Waiting');
    expect(positionDotLabel('empty')).toContain('Available');
  });

  test('carryover stripe visibility and fade variant rules', () => {
    expect(shouldShowCarryoverStripe(3, 'full')).toBe(true);
    expect(shouldShowCarryoverStripe(0, 'full')).toBe(false);
    expect(shouldShowCarryoverStripe(2, 'chip')).toBe(false);
    expect(carryoverHeading()).toBe('OPEN FROM YESTERDAY');
  });

  test('ongoing games use text-only visibility rules', () => {
    expect(shouldShowOngoingCount(7, 'full')).toBe(true);
    expect(shouldShowOngoingCount(0, 'full')).toBe(false);
    expect(shouldShowOngoingCount(7, 'chip')).toBe(false);
  });

  test('defaults provide 5 free positions and 10 paid slots', () => {
    expect(defaultFreeTodayPositions()).toHaveLength(5);
    expect(defaultPaidQueueSlots(3).filter((s) => s.state === 'waiting')).toHaveLength(3);
  });
});

test.describe('RatedDailyUsageStrip component (static)', () => {
  test('component remains unwired and retains visual upgrade marker', () => {
    const component = readFileSync(
      join(process.cwd(), 'components', 'free', 'RatedDailyUsageStrip.tsx'),
      'utf8',
    );
    expect(component).toContain('RatedDailyUsageStrip');
    expect(component).toContain('ACCL_RATED_TICKET_PUNCH_VISUAL_UPGRADE_REQUIRED');
    expect(component).toContain('data-testid="rated-daily-usage-strip"');
    expect(component).toContain('data-testid="rated-daily-carryover-stripe"');
    expect(component).toContain('opacity-70');
    expect(component).not.toContain('FreeLobbyModeRoomContent');
    expect(component).not.toContain('ProfileRatings');
  });

  test('full variant includes pending and paid unlock sections', () => {
    const component = readFileSync(
      join(process.cwd(), 'components', 'free', 'RatedDailyUsageStrip.tsx'),
      'utf8',
    );
    expect(component).toContain('rated-daily-pending-challenges');
    expect(component).toContain('rated-daily-paid-unlock-badge');
    expect(component).toContain("variant === 'compact'");
    expect(component).toContain("variant === 'chip'");
  });
});
