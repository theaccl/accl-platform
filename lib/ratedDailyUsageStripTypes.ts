/** Read model returned by public.free_play_read_rated_daily_usage_strip(uuid). */
export type RatedDailyPositionState = 'empty' | 'waiting' | 'committed';

export type RatedDailyQueueSlotState = 'empty' | 'waiting';

export type RatedDailyTodayPosition = {
  position_no: number;
  state: RatedDailyPositionState;
};

export type RatedDailyQueueSlot = {
  slot_no: number;
  state: RatedDailyQueueSlotState;
};

export type RatedDailyUsageStripSnapshotBase = {
  utc_day: string;
  reset_at: string;
  entitlement_rated_play_unlock: boolean;
  carryover_waiting_count: number;
  carryover_expires_at: string;
  ongoing_seated_rated_daily_count: number;
  pending_sent_rated_daily_challenge_count: number;
  pending_sent_rated_daily_challenge_cap: number;
  legacy_unclassified_rated_daily_count: number;
};

export type RatedDailyUsageStripSnapshotFree = RatedDailyUsageStripSnapshotBase & {
  entitlement_rated_play_unlock: false;
  today_allowance: 5;
  today_waiting_count: number;
  today_committed_count: number;
  today_available_count: number;
  today_positions: RatedDailyTodayPosition[];
};

export type RatedDailyUsageStripSnapshotPaid = RatedDailyUsageStripSnapshotBase & {
  entitlement_rated_play_unlock: true;
  today_queue_allowance: 10;
  today_waiting_count: number;
  today_queue_available_count: number;
  today_queue_slots: RatedDailyQueueSlot[];
  acceptance_unlimited: true;
};

export type RatedDailyUsageStripSnapshot =
  | RatedDailyUsageStripSnapshotFree
  | RatedDailyUsageStripSnapshotPaid;

export type RatedDailyUsageStripVariant = 'full' | 'compact' | 'chip';

export function isPaidRatedDailyUsageSnapshot(
  snapshot: RatedDailyUsageStripSnapshot,
): snapshot is RatedDailyUsageStripSnapshotPaid {
  return snapshot.entitlement_rated_play_unlock === true;
}

export function parseRatedDailyUsageStripSnapshot(raw: unknown): RatedDailyUsageStripSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.utc_day !== 'string' || typeof o.reset_at !== 'string') return null;
  if (o.entitlement_rated_play_unlock === true) {
    return {
      utc_day: o.utc_day,
      reset_at: o.reset_at,
      entitlement_rated_play_unlock: true,
      today_queue_allowance: 10,
      today_waiting_count: numberField(o.today_waiting_count),
      today_queue_available_count: numberField(o.today_queue_available_count),
      today_queue_slots: parseQueueSlots(o.today_queue_slots),
      carryover_waiting_count: numberField(o.carryover_waiting_count),
      carryover_expires_at: stringField(o.carryover_expires_at) ?? o.reset_at,
      ongoing_seated_rated_daily_count: numberField(o.ongoing_seated_rated_daily_count),
      pending_sent_rated_daily_challenge_count: numberField(o.pending_sent_rated_daily_challenge_count),
      pending_sent_rated_daily_challenge_cap: numberField(o.pending_sent_rated_daily_challenge_cap, 10),
      acceptance_unlimited: true,
      legacy_unclassified_rated_daily_count: numberField(o.legacy_unclassified_rated_daily_count),
    };
  }
  return {
    utc_day: o.utc_day,
    reset_at: o.reset_at,
    entitlement_rated_play_unlock: false,
    today_allowance: 5,
    today_waiting_count: numberField(o.today_waiting_count),
    today_committed_count: numberField(o.today_committed_count),
    today_available_count: numberField(o.today_available_count),
    today_positions: parseTodayPositions(o.today_positions),
    carryover_waiting_count: numberField(o.carryover_waiting_count),
    carryover_expires_at: stringField(o.carryover_expires_at) ?? o.reset_at,
    ongoing_seated_rated_daily_count: numberField(o.ongoing_seated_rated_daily_count),
    pending_sent_rated_daily_challenge_count: numberField(o.pending_sent_rated_daily_challenge_count),
    pending_sent_rated_daily_challenge_cap: numberField(o.pending_sent_rated_daily_challenge_cap, 5),
    legacy_unclassified_rated_daily_count: numberField(o.legacy_unclassified_rated_daily_count),
  };
}

function numberField(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function parseTodayPositions(value: unknown): RatedDailyTodayPosition[] {
  if (!Array.isArray(value)) return defaultFreeTodayPositions();
  const parsed = value
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const positionNo = numberField(r.position_no);
      const state = r.state;
      if (positionNo < 1 || positionNo > 5) return null;
      if (state !== 'empty' && state !== 'waiting' && state !== 'committed') return null;
      return { position_no: positionNo, state };
    })
    .filter((row): row is RatedDailyTodayPosition => row != null)
    .sort((a, b) => a.position_no - b.position_no);
  return parsed.length > 0 ? parsed : defaultFreeTodayPositions();
}

function parseQueueSlots(value: unknown): RatedDailyQueueSlot[] {
  if (!Array.isArray(value)) return defaultPaidQueueSlots(0);
  const parsed = value
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const slotNo = numberField(r.slot_no);
      const state = r.state;
      if (slotNo < 1 || slotNo > 10) return null;
      if (state !== 'empty' && state !== 'waiting') return null;
      return { slot_no: slotNo, state };
    })
    .filter((row): row is RatedDailyQueueSlot => row != null)
    .sort((a, b) => a.slot_no - b.slot_no);
  return parsed.length > 0 ? parsed : defaultPaidQueueSlots(0);
}

export function defaultFreeTodayPositions(): RatedDailyTodayPosition[] {
  return [1, 2, 3, 4, 5].map((position_no) => ({ position_no, state: 'empty' as const }));
}

export function defaultPaidQueueSlots(waitingCount: number): RatedDailyQueueSlot[] {
  return Array.from({ length: 10 }, (_, index) => {
    const slot_no = index + 1;
    return { slot_no, state: slot_no <= waitingCount ? 'waiting' : 'empty' };
  });
}

/** ACCL_RATED_TICKET_PUNCH_VISUAL_UPGRADE_REQUIRED — artwork / punch animation deferred. */
export const RATED_DAILY_TICKET_PUNCH_VISUAL_UPGRADE_MARKER =
  'ACCL_RATED_TICKET_PUNCH_VISUAL_UPGRADE_REQUIRED';
