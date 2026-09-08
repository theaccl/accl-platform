/**
 * R042 — Multi-Period Compare Mode: pure state / window model (Stack 1).
 *
 * Doctrine (mirrors the sibling ticker helpers):
 *  - Pure and deterministic. No React, no Supabase, no DOM, no mutation of inputs.
 *  - Operates only over already-loaded authoritative `RatingHistoryPoint[]` and
 *    caller-supplied `nowMs` / timezone. Never fabricates games, markers, ratings,
 *    or links. Never touches Elo / settlement / the ledger writer.
 *  - Calendar math is delegated to the accepted UTC helpers in
 *    `ratingTickerTimeZone` / `ratingTickerCalendar`; this module never rewrites
 *    original ISO timestamps.
 *
 * Scope note: Stack 1 builds the state/window model and its ordering + reset
 * contracts only. Visual panels, the merge overlay, premium sliders, and the
 * persistence UI are later stacks. The pure preset table and the
 * session-vs-account separation live here because the reset contract (invariant
 * 12/13) cannot be proven without them.
 */

import {
  isoWeekFromInstant,
} from '@/lib/profile/ratingTickerCalendar';
import {
  addCivilDays,
  instantToCivil,
  resolveTimeZone,
  startOfCivilDayUtcMs,
  RATING_TICKER_DISPLAY_TIME_ZONE,
  type CivilDate,
} from '@/lib/profile/ratingTickerTimeZone';
import { finishedGameHref, finishedGameTrainHref } from '@/lib/profileRatingFinishedLinks';
import {
  laneMovementFromPoints,
  lastRatingAfterBefore,
  type RatingLane,
} from '@/lib/ratingHistoryMetrics';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';

/* ------------------------------------------------------------------ *
 * Identities and constants
 * ------------------------------------------------------------------ */

/** Main owns the lane. Overall is a valid Main lane but disables Compare Mode. */
export type CompareLane = RatingLane;

/** A comparison ticker occupies one of three fixed slots. */
export type CompareTickerSlot = 'ct1' | 'ct2' | 'ct3';

export const COMPARE_TICKER_SLOTS: readonly CompareTickerSlot[] = ['ct1', 'ct2', 'ct3'];

/** Main plus up to three CTs. */
export type CompareSeriesId = 'main' | CompareTickerSlot;

export const MAIN_SERIES_ID = 'main' as const;

/** Rank 1 belongs permanently to Main; CTs take unique ranks 2..4. */
export type CompareRank = 1 | 2 | 3 | 4;
export type CompareCtRank = 2 | 3 | 4;
export const MAIN_RANK: CompareRank = 1;
export const MAX_COMPARE_TICKERS = 3;

/** Bounded, non-overall lane an anchor can be bucketed into. */
export type CompareBucketLane = Exclude<CompareLane, 'overall'>;

/* ------------------------------------------------------------------ *
 * State shapes
 * ------------------------------------------------------------------ */

/** Progression is per-CT: parked (faint context) vs promoted (brought into view). */
export type CompareProgression = 'parked' | 'promoted';

/** Expanded layout control. Independent panels vs one merged overlay. */
export type CompareLayout = 'independent' | 'merge';

/**
 * One comparison ticker.
 *  - `anchorMs` is the persistent chosen instant. Periods are always *derived*
 *    from (lane, anchorMs), so changing Main's lane re-buckets every CT for free.
 *  - `rank` is unique across active CTs.
 *  - `progression` never influences ordering.
 */
export type CompareTicker = {
  slot: CompareTickerSlot;
  rank: CompareCtRank;
  anchorMs: number;
  progression: CompareProgression;
};

/**
 * Compare *session* state. Everything here resets on the next open after a UTC
 * date change (invariant 12). Account-level visual preferences are a separate
 * model (see `CompareVisualPreferences`) and are never stored here.
 */
export type CompareSessionState = {
  lane: CompareLane;
  cts: CompareTicker[];
  layout: CompareLayout;
  introSeen: boolean;
};

/* ------------------------------------------------------------------ *
 * Derived period windows
 * ------------------------------------------------------------------ */

export type ComparePeriod = {
  lane: CompareBucketLane;
  timeZone: string;
  /** UTC epoch ms, inclusive. */
  startMs: number;
  /** UTC epoch ms, exclusive. */
  endMs: number;
  /** The instant the period was derived from, normalized to lie in [start, end). */
  anchorMs: number;
  /** ISO week identity when the lane is week (else undefined). */
  isoWeek?: ReturnType<typeof isoWeekFromInstant>;
};

/** Truthful occupancy of a CT period. Never invents movement. */
export type ComparePeriodOccupancy = {
  games: number;
  /**
   * Rating carried into the period from the last real event strictly before it.
   * Null when the viewer had no prior event — then an empty period is truly empty.
   */
  carryInRating: number | null;
  /** No in-window games and no carry-in: draw nothing. */
  isEmpty: boolean;
  /** No in-window games but a real carry-in exists: draw a flat hold, no markers. */
  isCarryInHold: boolean;
  /** Net change across in-window games (last.after - first.before). Null when empty. */
  netRatingChange: number | null;
};

/* ------------------------------------------------------------------ *
 * Result type for fallible operations
 * ------------------------------------------------------------------ */

export type CompareOpFailure =
  | 'compare_disabled_overall'
  | 'slots_full'
  | 'unknown_slot'
  | 'future_period'
  | 'invalid_anchor'
  | 'invalid_rank'
  | 'no_op';

export type CompareOpResult =
  | { ok: true; state: CompareSessionState }
  | { ok: false; reason: CompareOpFailure; state: CompareSessionState };

function ok(state: CompareSessionState): CompareOpResult {
  return { ok: true, state };
}
function fail(state: CompareSessionState, reason: CompareOpFailure): CompareOpResult {
  return { ok: false, reason, state };
}

/* ------------------------------------------------------------------ *
 * Compare-mode availability
 * ------------------------------------------------------------------ */

/** Compare Mode is available for every Main lane except Overall (invariant 6). */
export function isCompareEnabled(lane: CompareLane): boolean {
  return lane !== 'overall';
}

/** Active CTs, empty when compare is disabled (Overall). Anchors are retained. */
export function activeCompareTickers(state: CompareSessionState): CompareTicker[] {
  if (!isCompareEnabled(state.lane)) return [];
  return [...state.cts];
}

/* ------------------------------------------------------------------ *
 * Period derivation (bucketing / re-bucketing)
 * ------------------------------------------------------------------ */

function nextMonthStart(date: CivilDate): CivilDate {
  return date.month === 12
    ? { year: date.year + 1, month: 1, day: 1 }
    : { year: date.year, month: date.month + 1, day: 1 };
}

/**
 * Full UTC calendar period containing `anchorMs` for a bounded lane.
 * Unlike `ratingLaneWindow`, this never truncates the month/year to "now" — a
 * historical bucket owns the whole calendar period. Returns null for a
 * non-finite anchor.
 */
export function compareAnchorPeriod(
  lane: CompareBucketLane,
  anchorMs: number,
  timeZone: string = RATING_TICKER_DISPLAY_TIME_ZONE,
): ComparePeriod | null {
  if (!Number.isFinite(anchorMs)) return null;
  const tz = resolveTimeZone(timeZone);
  const civil = instantToCivil(anchorMs, tz);
  const civilDate: CivilDate = { year: civil.year, month: civil.month, day: civil.day };

  if (lane === 'day') {
    const startMs = startOfCivilDayUtcMs(civilDate, tz);
    const endMs = startOfCivilDayUtcMs(addCivilDays(civilDate, 1), tz);
    return { lane, timeZone: tz, startMs, endMs, anchorMs };
  }
  if (lane === 'week') {
    const iso = isoWeekFromInstant(anchorMs, tz);
    return { lane, timeZone: tz, startMs: iso.startMs, endMs: iso.endMs, anchorMs, isoWeek: iso };
  }
  if (lane === 'month') {
    const start: CivilDate = { year: civil.year, month: civil.month, day: 1 };
    const startMs = startOfCivilDayUtcMs(start, tz);
    const endMs = startOfCivilDayUtcMs(nextMonthStart(start), tz);
    return { lane, timeZone: tz, startMs, endMs, anchorMs };
  }
  // year
  const startMs = startOfCivilDayUtcMs({ year: civil.year, month: 1, day: 1 }, tz);
  const endMs = startOfCivilDayUtcMs({ year: civil.year + 1, month: 1, day: 1 }, tz);
  return { lane, timeZone: tz, startMs, endMs, anchorMs };
}

/** Derive a CT's current period from the session lane + its retained anchor. */
export function ctPeriod(
  state: CompareSessionState,
  slot: CompareTickerSlot,
  timeZone: string = RATING_TICKER_DISPLAY_TIME_ZONE,
): ComparePeriod | null {
  if (!isCompareEnabled(state.lane)) return null;
  const ct = state.cts.find((c) => c.slot === slot);
  if (!ct) return null;
  return compareAnchorPeriod(state.lane as CompareBucketLane, ct.anchorMs, timeZone);
}

/**
 * A period is selectable only when it is not wholly in the future (invariant 7).
 * The current period (start ≤ now < end) is allowed; a period whose start is
 * after `nowMs` is a future period and is rejected.
 */
export function isPeriodSelectable(period: ComparePeriod, nowMs: number): boolean {
  if (!Number.isFinite(nowMs)) return false;
  return period.startMs <= nowMs;
}

/** True when the raw anchor lands in a selectable (non-future) period. */
export function isAnchorSelectable(
  lane: CompareBucketLane,
  anchorMs: number,
  nowMs: number,
  timeZone: string = RATING_TICKER_DISPLAY_TIME_ZONE,
): boolean {
  const period = compareAnchorPeriod(lane, anchorMs, timeZone);
  if (!period) return false;
  return isPeriodSelectable(period, nowMs);
}

/* ------------------------------------------------------------------ *
 * Occupancy (truthful empty / carry-in) and links
 * ------------------------------------------------------------------ */

/** In-window points for a period, start-inclusive / end-exclusive. Pure. */
export function pointsInPeriod(
  points: RatingHistoryPoint[],
  period: ComparePeriod,
): RatingHistoryPoint[] {
  return points.filter((p) => {
    const t = Date.parse(p.occurredAt);
    if (!Number.isFinite(t)) return false;
    return t >= period.startMs && t < period.endMs;
  });
}

/**
 * Truthful occupancy for a CT period. Empty periods stay empty; a carry-in hold
 * is drawn only when a real prior event exists. Never fabricates movement.
 */
export function periodOccupancy(
  points: RatingHistoryPoint[],
  period: ComparePeriod,
): ComparePeriodOccupancy {
  const inWindow = pointsInPeriod(points, period);
  const carryInRating = lastRatingAfterBefore(points, period.startMs);
  const games = inWindow.length;
  if (games === 0) {
    return {
      games: 0,
      carryInRating,
      isEmpty: carryInRating == null,
      isCarryInHold: carryInRating != null,
      netRatingChange: null,
    };
  }
  return {
    games,
    carryInRating,
    isEmpty: false,
    isCarryInHold: false,
    netRatingChange: laneMovementFromPoints(inWindow),
  };
}

export type CompareEventLinks = {
  openGameHref: string | null;
  trainerReviewHref: string | null;
};

/**
 * Link targets for a history event. Open game / Trainer review exist only when
 * the event carries a real game id (invariant 10; "missing game IDs never
 * produce fabricated links"). A null/blank id yields null hrefs.
 */
export function compareEventLinks(point: Pick<RatingHistoryPoint, 'gameId'>): CompareEventLinks {
  const id = typeof point.gameId === 'string' ? point.gameId.trim() : '';
  if (!id) return { openGameHref: null, trainerReviewHref: null };
  return {
    openGameHref: finishedGameHref(id),
    trainerReviewHref: finishedGameTrainHref(id),
  };
}

/** Whether an event may expose finished-game links at all. */
export function canLinkCompareEvent(point: Pick<RatingHistoryPoint, 'gameId'>): boolean {
  const links = compareEventLinks(point);
  return links.openGameHref != null;
}

/* ------------------------------------------------------------------ *
 * Rank ordering — the single ordering authority
 * ------------------------------------------------------------------ */

/**
 * The ONLY ordering authority (invariant 11). Rank alone decides overlay
 * z-order, independent-panel order, legend order, tooltip order, pointer
 * ownership at crossings, and reveal order. Progression, transparency, anchor
 * dates, and reveal state are intentionally *not* inputs here, which
 * structurally guarantees they can never reorder lines.
 *
 * Returns Main first, then CTs by ascending rank.
 */
export function rankedSeriesOrder(state: CompareSessionState): CompareSeriesId[] {
  const ctsByRank = [...state.cts]
    .sort((a, b) => a.rank - b.rank)
    .map((c) => c.slot);
  return [MAIN_SERIES_ID, ...ctsByRank];
}

/** Reveal / intro order is exactly rank order (Main, rank 2, rank 3, rank 4). */
export function revealOrder(state: CompareSessionState): CompareSeriesId[] {
  return rankedSeriesOrder(state);
}

/**
 * Pointer ownership at a crossing: among overlapping series the highest rank
 * (Main first) owns the pointer. Returns null when no candidate is present.
 */
export function resolvePointerOwner(
  state: CompareSessionState,
  candidates: readonly CompareSeriesId[],
): CompareSeriesId | null {
  const wanted = new Set(candidates);
  for (const id of rankedSeriesOrder(state)) {
    if (wanted.has(id)) return id;
  }
  return null;
}

/** Rank of a series id in the current state, or null if that CT is not active. */
export function rankOf(state: CompareSessionState, id: CompareSeriesId): CompareRank | null {
  if (id === MAIN_SERIES_ID) return MAIN_RANK;
  const ct = state.cts.find((c) => c.slot === id);
  return ct ? ct.rank : null;
}

/* ------------------------------------------------------------------ *
 * Session construction and lane control
 * ------------------------------------------------------------------ */

export function createCompareSession(lane: CompareLane = 'month'): CompareSessionState {
  return { lane, cts: [], layout: 'independent', introSeen: false };
}

/**
 * Set Main's lane. CTs keep their anchors; periods re-derive automatically
 * (invariant 8). Switching to Overall disables Compare Mode but retains anchors
 * so returning to a bounded lane restores the CTs, re-bucketed.
 */
export function setMainLane(state: CompareSessionState, lane: CompareLane): CompareSessionState {
  if (lane === state.lane) return state;
  return { ...state, lane };
}

/* ------------------------------------------------------------------ *
 * CT lifecycle
 * ------------------------------------------------------------------ */

function nextFreeSlot(state: CompareSessionState): CompareTickerSlot | null {
  const used = new Set(state.cts.map((c) => c.slot));
  return COMPARE_TICKER_SLOTS.find((s) => !used.has(s)) ?? null;
}

function nextFreeRank(state: CompareSessionState): CompareCtRank {
  const used = new Set(state.cts.map((c) => c.rank));
  return (([2, 3, 4] as CompareCtRank[]).find((r) => !used.has(r)) ?? 4);
}

/**
 * Add a CT anchored at `anchorMs`. Default rank is order added (invariant:
 * "Default rank is order added"). Rejected when Overall (disabled), slots are
 * full, the anchor is invalid, or the anchor lands in a future period.
 */
export function addCompareTicker(
  state: CompareSessionState,
  anchorMs: number,
  nowMs: number,
  timeZone: string = RATING_TICKER_DISPLAY_TIME_ZONE,
): CompareOpResult {
  if (!isCompareEnabled(state.lane)) return fail(state, 'compare_disabled_overall');
  if (state.cts.length >= MAX_COMPARE_TICKERS) return fail(state, 'slots_full');
  const period = compareAnchorPeriod(state.lane as CompareBucketLane, anchorMs, timeZone);
  if (!period) return fail(state, 'invalid_anchor');
  if (!isPeriodSelectable(period, nowMs)) return fail(state, 'future_period');
  const slot = nextFreeSlot(state);
  if (!slot) return fail(state, 'slots_full');
  const ct: CompareTicker = {
    slot,
    rank: nextFreeRank(state),
    anchorMs: period.anchorMs,
    progression: 'parked',
  };
  return ok({ ...state, cts: [...state.cts, ct] });
}

/** Re-pack CT ranks to a contiguous unique 2..N preserving relative order. */
function repackRanks(cts: CompareTicker[]): CompareTicker[] {
  const byRank = [...cts].sort((a, b) => a.rank - b.rank);
  return byRank.map((c, i) => ({ ...c, rank: (i + 2) as CompareCtRank }));
}

/** Remove a CT and re-pack remaining ranks so 2..N stay unique and contiguous. */
export function removeCompareTicker(
  state: CompareSessionState,
  slot: CompareTickerSlot,
): CompareOpResult {
  if (!state.cts.some((c) => c.slot === slot)) return fail(state, 'unknown_slot');
  const remaining = repackRanks(state.cts.filter((c) => c.slot !== slot));
  return ok({ ...state, cts: remaining });
}

/* ------------------------------------------------------------------ *
 * Anchor navigation (date search / calendar / game pick / prev-next)
 * ------------------------------------------------------------------ */

function updateCt(
  state: CompareSessionState,
  slot: CompareTickerSlot,
  patch: (ct: CompareTicker) => CompareTicker,
): CompareSessionState {
  return { ...state, cts: state.cts.map((c) => (c.slot === slot ? patch(c) : c)) };
}

/**
 * Assign a CT anchor directly (UTC date search, calendar pick, or "Choose from
 * games" — a picked game's instant). Rejected when disabled, unknown slot,
 * invalid, or future.
 */
export function setCtAnchor(
  state: CompareSessionState,
  slot: CompareTickerSlot,
  anchorMs: number,
  nowMs: number,
  timeZone: string = RATING_TICKER_DISPLAY_TIME_ZONE,
): CompareOpResult {
  if (!isCompareEnabled(state.lane)) return fail(state, 'compare_disabled_overall');
  if (!state.cts.some((c) => c.slot === slot)) return fail(state, 'unknown_slot');
  const period = compareAnchorPeriod(state.lane as CompareBucketLane, anchorMs, timeZone);
  if (!period) return fail(state, 'invalid_anchor');
  if (!isPeriodSelectable(period, nowMs)) return fail(state, 'future_period');
  return ok(updateCt(state, slot, (c) => ({ ...c, anchorMs: period.anchorMs })));
}

/**
 * Step a CT one period earlier ('prev') or later ('next') within the shared
 * unit. 'next' is rejected when it would enter a future period (invariant 7).
 */
export function stepCtPeriod(
  state: CompareSessionState,
  slot: CompareTickerSlot,
  direction: 'prev' | 'next',
  nowMs: number,
  timeZone: string = RATING_TICKER_DISPLAY_TIME_ZONE,
): CompareOpResult {
  if (!isCompareEnabled(state.lane)) return fail(state, 'compare_disabled_overall');
  const ct = state.cts.find((c) => c.slot === slot);
  if (!ct) return fail(state, 'unknown_slot');
  const current = compareAnchorPeriod(state.lane as CompareBucketLane, ct.anchorMs, timeZone);
  if (!current) return fail(state, 'invalid_anchor');
  // A single instant inside the neighbouring period: end of current period for
  // 'next' (start of the next period), or one ms before the start for 'prev'.
  const probe = direction === 'next' ? current.endMs : current.startMs - 1;
  const neighbour = compareAnchorPeriod(state.lane as CompareBucketLane, probe, timeZone);
  if (!neighbour) return fail(state, 'invalid_anchor');
  if (!isPeriodSelectable(neighbour, nowMs)) return fail(state, 'future_period');
  return ok(updateCt(state, slot, (c) => ({ ...c, anchorMs: neighbour.anchorMs })));
}

/* ------------------------------------------------------------------ *
 * Rank control (swap / cycle) — Main is immovable
 * ------------------------------------------------------------------ */

/**
 * Assign `newRank` (2..4) to a CT. Assigning an occupied rank swaps the two CTs
 * (invariant 9). Rank 1 (Main) can never be assigned to a CT.
 */
export function assignCtRank(
  state: CompareSessionState,
  slot: CompareTickerSlot,
  newRank: CompareCtRank,
): CompareOpResult {
  if (newRank !== 2 && newRank !== 3 && newRank !== 4) return fail(state, 'invalid_rank');
  const target = state.cts.find((c) => c.slot === slot);
  if (!target) return fail(state, 'unknown_slot');
  if (target.rank === newRank) return fail(state, 'no_op');
  const holder = state.cts.find((c) => c.rank === newRank && c.slot !== slot);
  const oldRank = target.rank;
  const cts = state.cts.map((c) => {
    if (c.slot === slot) return { ...c, rank: newRank };
    if (holder && c.slot === holder.slot) return { ...c, rank: oldRank };
    return c;
  });
  return ok({ ...state, cts });
}

/**
 * Move a CT one step toward Main ('up' → smaller rank) or away ('down' → larger
 * rank), swapping with the neighbour that holds the adjacent rank. Edge moves
 * are a no-op. Mobile-accessible up/down / tap-to-cycle uses this.
 */
export function moveCtRank(
  state: CompareSessionState,
  slot: CompareTickerSlot,
  direction: 'up' | 'down',
): CompareOpResult {
  const ct = state.cts.find((c) => c.slot === slot);
  if (!ct) return fail(state, 'unknown_slot');
  const targetRank = (direction === 'up' ? ct.rank - 1 : ct.rank + 1) as CompareCtRank;
  if (targetRank < 2 || targetRank > 4) return fail(state, 'no_op');
  if (!state.cts.some((c) => c.rank === targetRank)) return fail(state, 'no_op');
  return assignCtRank(state, slot, targetRank);
}

/* ------------------------------------------------------------------ *
 * Progression (parked vs promoted) — never reorders
 * ------------------------------------------------------------------ */

/** Set one CT's progression. Never changes rank; never reorders lines. */
export function setCtProgression(
  state: CompareSessionState,
  slot: CompareTickerSlot,
  progression: CompareProgression,
): CompareOpResult {
  if (!state.cts.some((c) => c.slot === slot)) return fail(state, 'unknown_slot');
  return ok(updateCt(state, slot, (c) => ({ ...c, progression })));
}

/** Bring every CT into view (the "All" control). Order is untouched. */
export function promoteAllCts(state: CompareSessionState): CompareSessionState {
  return { ...state, cts: state.cts.map((c) => ({ ...c, progression: 'promoted' })) };
}

/** Park every CT. Order is untouched. */
export function parkAllCts(state: CompareSessionState): CompareSessionState {
  return { ...state, cts: state.cts.map((c) => ({ ...c, progression: 'parked' })) };
}

/* ------------------------------------------------------------------ *
 * Layout and intro
 * ------------------------------------------------------------------ */

export function setCompareLayout(
  state: CompareSessionState,
  layout: CompareLayout,
): CompareSessionState {
  return { ...state, layout };
}

export function markIntroSeen(state: CompareSessionState): CompareSessionState {
  return state.introSeen ? state : { ...state, introSeen: true };
}

/* ------------------------------------------------------------------ *
 * UTC-day session reset (invariant 12)
 * ------------------------------------------------------------------ */

/**
 * Reset the compare *session* for a new UTC day: active CTs, anchors, rank
 * setup, progression, layout, and intro-seen all clear. The Main lane is
 * preserved because it is a chart-window choice, not comparison session data.
 *
 * This function deliberately takes and returns ONLY session state — it has no
 * access to and cannot mutate account-level visual preferences (invariant 13).
 */
export function resetCompareSessionForNewUtcDay(
  state: CompareSessionState,
): CompareSessionState {
  return createCompareSession(state.lane);
}

/* ------------------------------------------------------------------ *
 * Account-level visual preferences — a SEPARATE, persistent model
 * ------------------------------------------------------------------ */

export type CompareVisualPreset =
  | 'default'
  | 'high_contrast'
  | 'main_focus'
  | 'equal_visibility'
  | 'custom';

export type CompareSlotOpacity = { main: number; progressionCt: number; parkedCt: number };

/** Preset opacities (Main / progression CT / parked CT), verbatim from the spec. */
export const COMPARE_PRESET_OPACITY: Record<
  Exclude<CompareVisualPreset, 'custom'>,
  CompareSlotOpacity
> = {
  default: { main: 100, progressionCt: 90, parkedCt: 30 },
  high_contrast: { main: 100, progressionCt: 100, parkedCt: 60 },
  main_focus: { main: 100, progressionCt: 70, parkedCt: 15 },
  equal_visibility: { main: 100, progressionCt: 100, parkedCt: 100 },
};

/** Recommended safe visibility floors (percent). */
export const MAIN_OPACITY_FLOOR = 70;
export const CT_OPACITY_FLOOR = 10;

/**
 * Account-level visual preferences. Persist across UTC reset; stored separately
 * from `CompareSessionState`. Custom per-slot values are premium (gated later).
 */
export type CompareVisualPreferences = {
  preset: CompareVisualPreset;
  custom?: CompareSlotOpacity;
};

export function createDefaultVisualPreferences(): CompareVisualPreferences {
  return { preset: 'default' };
}

/** Resolve the opacity table for the active preset (custom falls back to Default). */
export function resolvePresetOpacity(prefs: CompareVisualPreferences): CompareSlotOpacity {
  if (prefs.preset === 'custom' && prefs.custom) return prefs.custom;
  const base = COMPARE_PRESET_OPACITY[
    (prefs.preset === 'custom' ? 'default' : prefs.preset)
  ];
  return { ...base };
}

/** Clamp faint CTs to a safe export floor while always keeping Main legible. */
export function clampOpacityForExport(op: CompareSlotOpacity): CompareSlotOpacity {
  return {
    main: Math.min(100, Math.max(MAIN_OPACITY_FLOOR, op.main)),
    progressionCt: Math.min(100, Math.max(CT_OPACITY_FLOOR, op.progressionCt)),
    parkedCt: Math.min(100, Math.max(CT_OPACITY_FLOOR, op.parkedCt)),
  };
}
