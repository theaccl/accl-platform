import { expect, test } from '@playwright/test';

import {
  activeCompareTickers,
  addCompareTicker,
  assignCtRank,
  canLinkCompareEvent,
  clampOpacityForExport,
  clampOpacityForScreen,
  compareAnchorPeriod,
  compareEventLinks,
  COMPARE_PRESET_OPACITY,
  countRealGames,
  createCompareSession,
  createDefaultVisualPreferences,
  CT_EXPORT_OPACITY_FLOOR,
  CT_ONSCREEN_OPACITY_FLOOR,
  ctPeriod,
  isAnchorSelectable,
  isCompareEnabled,
  isPeriodSelectable,
  isRealGameEvent,
  markIntroSeen,
  MAIN_OPACITY_FLOOR,
  MAIN_RANK,
  MAIN_SERIES_ID,
  MAX_COMPARE_TICKERS,
  moveCtRank,
  parkAllCts,
  periodOccupancy,
  pointsInPeriod,
  promoteAllCts,
  rankedSeriesOrder,
  rankOf,
  removeCompareTicker,
  reopenCompareSessionForUtcDay,
  resetCompareSession,
  resolvePresetOpacity,
  resolvePointerOwner,
  revealOrder,
  setCompareLayout,
  setCtAnchor,
  setCtProgression,
  setMainLane,
  stepCtPeriod,
  utcDayKey,
  type CompareOpResult,
  type CompareSessionState,
} from '../../lib/profile/compareMode';
import {
  buildRatingHistoryPointsFromLedger,
  type RatingHistoryLedgerRow,
} from '../../lib/ratingHistoryLedgerBuild';
import type { RatingHistoryPoint } from '../../lib/ratingHistoryTypes';

const NOW = Date.parse('2026-09-07T12:00:00Z');
const NOW_DAY_KEY = '2026-09-07';
const AUG_ANCHOR = Date.parse('2026-08-15T10:00:00Z');

function point(
  partial: Partial<RatingHistoryPoint> & { id: string; occurredAt: string },
): RatingHistoryPoint {
  return {
    playerId: 'u1',
    ecosystem: 'free',
    eventType: 'game',
    result: 'win',
    ratingTrackId: 'free_blitz',
    ratingBefore: 1500,
    ratingAfter: 1510,
    ratingDelta: 10,
    ...partial,
  };
}

/** Minimal authoritative ledger row for loader-path regression checks. */
function ledgerRow(
  partial: Partial<RatingHistoryLedgerRow> & { id: string; occurred_at: string },
): RatingHistoryLedgerRow {
  return {
    player_id: 'u1',
    rating_track_id: 'accl_overall',
    ecosystem: 'global',
    rating_scope: 'overall',
    mode: null,
    time_control: null,
    badge_track_key: null,
    event_type: 'game',
    game_id: null,
    tournament_id: null,
    bracket_id: null,
    opponent_id: null,
    opponent_username: null,
    result: 'win',
    rating_before: 1500,
    rating_after: 1510,
    rating_delta: 10,
    badge_state_before: null,
    badge_state_after: null,
    badge_event: null,
    streak_before: null,
    streak_after: null,
    is_backfilled: false,
    metadata: null,
    ...partial,
  };
}

/** Unwrap a successful op or fail the test loudly. */
function must(result: CompareOpResult): CompareSessionState {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return result.state;
}

/** Build a session with N CTs anchored in the past, opened "today". */
function withCts(lane: CompareSessionState['lane'], anchors: number[]): CompareSessionState {
  let s = createCompareSession(lane, NOW);
  for (const a of anchors) s = must(addCompareTicker(s, a, NOW));
  return s;
}

test.describe('R042 compare mode — lane ownership and availability', () => {
  test('Main owns Day/Week/Month/Year/Overall; Overall disables Compare Mode', () => {
    expect(isCompareEnabled('day')).toBe(true);
    expect(isCompareEnabled('week')).toBe(true);
    expect(isCompareEnabled('month')).toBe(true);
    expect(isCompareEnabled('year')).toBe(true);
    expect(isCompareEnabled('overall')).toBe(false);
  });

  test('Rank 1 belongs permanently to Main', () => {
    const s = withCts('week', [AUG_ANCHOR]);
    expect(MAIN_RANK).toBe(1);
    expect(rankOf(s, MAIN_SERIES_ID)).toBe(1);
    expect(s.cts.every((c) => c.rank >= 2)).toBe(true);
  });
});

test.describe('R042 compare mode — shared unit and independent anchors', () => {
  test('all CTs use Main’s selected unit', () => {
    const s = withCts('month', [AUG_ANCHOR, Date.parse('2026-07-04T00:00:00Z')]);
    expect(ctPeriod(s, 'ct1')?.lane).toBe('month');
    expect(ctPeriod(s, 'ct2')?.lane).toBe('month');
  });

  test('CT1–CT3 independently choose historical anchors', () => {
    const s = withCts('day', [
      Date.parse('2026-08-15T10:00:00Z'),
      Date.parse('2026-08-10T10:00:00Z'),
      Date.parse('2026-07-01T10:00:00Z'),
    ]);
    expect(ctPeriod(s, 'ct1')?.startMs).not.toBe(ctPeriod(s, 'ct2')?.startMs);
    expect(ctPeriod(s, 'ct2')?.startMs).not.toBe(ctPeriod(s, 'ct3')?.startMs);
    expect(s.cts).toHaveLength(3);
  });

  test('a fourth CT is rejected — three slots only', () => {
    const s = withCts('day', [
      Date.parse('2026-08-15T10:00:00Z'),
      Date.parse('2026-08-10T10:00:00Z'),
      Date.parse('2026-07-01T10:00:00Z'),
    ]);
    expect(s.cts).toHaveLength(MAX_COMPARE_TICKERS);
    const fourth = addCompareTicker(s, Date.parse('2026-06-01T10:00:00Z'), NOW);
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) expect(fourth.reason).toBe('slots_full');
  });
});

test.describe('R042 compare mode — UTC period derivation', () => {
  test('day/week/month/year windows contain the anchor with correct bounds', () => {
    const day = compareAnchorPeriod('day', AUG_ANCHOR)!;
    expect(day.startMs).toBe(Date.parse('2026-08-15T00:00:00Z'));
    expect(day.endMs).toBe(Date.parse('2026-08-16T00:00:00Z'));

    const week = compareAnchorPeriod('week', AUG_ANCHOR)!;
    expect(week.startMs).toBe(Date.parse('2026-08-10T00:00:00Z'));
    expect(week.endMs).toBe(Date.parse('2026-08-17T00:00:00Z'));
    expect(week.isoWeek?.monday).toEqual({ year: 2026, month: 8, day: 10 });

    const month = compareAnchorPeriod('month', AUG_ANCHOR)!;
    expect(month.startMs).toBe(Date.parse('2026-08-01T00:00:00Z'));
    expect(month.endMs).toBe(Date.parse('2026-09-01T00:00:00Z'));

    const year = compareAnchorPeriod('year', AUG_ANCHOR)!;
    expect(year.startMs).toBe(Date.parse('2026-01-01T00:00:00Z'));
    expect(year.endMs).toBe(Date.parse('2027-01-01T00:00:00Z'));

    for (const p of [day, week, month, year]) {
      expect(p.startMs).toBeLessThanOrEqual(AUG_ANCHOR);
      expect(p.endMs).toBeGreaterThan(AUG_ANCHOR);
    }
  });

  test('ISO week for 2026-01-01 belongs to W01 with Monday 2025-12-29', () => {
    const week = compareAnchorPeriod('week', Date.parse('2026-01-01T12:00:00Z'))!;
    expect(week.isoWeek?.isoWeek).toBe(1);
    expect(week.isoWeek?.monday).toEqual({ year: 2025, month: 12, day: 29 });
  });

  test('non-finite anchors never invent a period', () => {
    expect(compareAnchorPeriod('day', Number.NaN)).toBeNull();
    expect(compareAnchorPeriod('month', Number.POSITIVE_INFINITY)).toBeNull();
  });
});

test.describe('R042 compare mode — re-bucketing on lane change', () => {
  test('changing Main’s lane re-buckets every CT’s retained anchor', () => {
    let s = withCts('day', [AUG_ANCHOR]);
    const anchorBefore = s.cts[0].anchorMs;

    expect(ctPeriod(s, 'ct1')!.startMs).toBe(Date.parse('2026-08-15T00:00:00Z'));
    s = setMainLane(s, 'month');
    expect(ctPeriod(s, 'ct1')!.startMs).toBe(Date.parse('2026-08-01T00:00:00Z'));
    s = setMainLane(s, 'year');
    expect(ctPeriod(s, 'ct1')!.startMs).toBe(Date.parse('2026-01-01T00:00:00Z'));

    expect(s.cts[0].anchorMs).toBe(anchorBefore);
  });
});

test.describe('R042 compare mode — future periods prohibited', () => {
  test('a future month anchor cannot be added', () => {
    const s = createCompareSession('month', NOW);
    const future = addCompareTicker(s, Date.parse('2026-10-01T00:00:00Z'), NOW);
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.reason).toBe('future_period');
  });

  test('the current period (containing now) is selectable', () => {
    const s = createCompareSession('day', NOW);
    expect(addCompareTicker(s, Date.parse('2026-09-07T00:00:00Z'), NOW).ok).toBe(true);
    expect(isAnchorSelectable('month', NOW, NOW)).toBe(true);
  });

  test('isPeriodSelectable rejects a wholly-future period', () => {
    expect(isPeriodSelectable(compareAnchorPeriod('month', Date.parse('2026-10-15T00:00:00Z'))!, NOW)).toBe(false);
    expect(isPeriodSelectable(compareAnchorPeriod('month', AUG_ANCHOR)!, NOW)).toBe(true);
  });

  test('stepping Next into the future is rejected; Prev/Next within the past works', () => {
    let s = withCts('month', [AUG_ANCHOR]);
    s = must(stepCtPeriod(s, 'ct1', 'next', NOW));
    expect(ctPeriod(s, 'ct1')?.startMs).toBe(Date.parse('2026-09-01T00:00:00Z'));
    const toOct = stepCtPeriod(s, 'ct1', 'next', NOW);
    expect(toOct.ok).toBe(false);
    if (!toOct.ok) expect(toOct.reason).toBe('future_period');
    s = must(stepCtPeriod(s, 'ct1', 'prev', NOW));
    expect(ctPeriod(s, 'ct1')?.startMs).toBe(Date.parse('2026-08-01T00:00:00Z'));
  });

  test('setCtAnchor rejects a future date', () => {
    const s = withCts('day', [AUG_ANCHOR]);
    const bad = setCtAnchor(s, 'ct1', Date.parse('2026-09-08T00:00:00Z'), NOW);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('future_period');
  });
});

test.describe('R042 compare mode — truthful empty / carry-in periods', () => {
  const augustDay = compareAnchorPeriod('day', AUG_ANCHOR)!;

  test('no in-window events and no prior event → truly empty (draw nothing)', () => {
    const occ = periodOccupancy([], augustDay);
    expect(occ.ratingEvents).toBe(0);
    expect(occ.games).toBe(0);
    expect(occ.carryInRating).toBeNull();
    expect(occ.isEmpty).toBe(true);
    expect(occ.isCarryInHold).toBe(false);
    expect(occ.netRatingChange).toBeNull();
  });

  test('no in-window events but a real prior event → carry-in hold, no markers', () => {
    const prior = [point({ id: 'p0', occurredAt: '2026-07-20T00:00:00Z', ratingAfter: 1544 })];
    const occ = periodOccupancy(prior, augustDay);
    expect(occ.ratingEvents).toBe(0);
    expect(occ.games).toBe(0);
    expect(occ.carryInRating).toBe(1544);
    expect(occ.isCarryInHold).toBe(true);
    expect(occ.isEmpty).toBe(false);
  });

  test('in-window games report a real net rating change', () => {
    const pts = [
      point({ id: 'a', occurredAt: '2026-08-15T09:00:00Z', ratingBefore: 1500, ratingAfter: 1520 }),
      point({ id: 'b', occurredAt: '2026-08-15T11:00:00Z', ratingBefore: 1520, ratingAfter: 1560 }),
      point({ id: 'far', occurredAt: '2026-08-20T11:00:00Z', ratingAfter: 9999 }),
    ];
    expect(pointsInPeriod(pts, augustDay)).toHaveLength(2);
    const occ = periodOccupancy(pts, augustDay);
    expect(occ.ratingEvents).toBe(2);
    expect(occ.games).toBe(2);
    expect(occ.netRatingChange).toBe(60);
    expect(occ.isEmpty).toBe(false);
  });
});

test.describe('R042 compare mode — rank ordering is the single authority', () => {
  test('CTs default to ranks 2,3,4 in order added; Main leads', () => {
    const s = withCts('week', [
      Date.parse('2026-08-15T10:00:00Z'),
      Date.parse('2026-08-01T10:00:00Z'),
      Date.parse('2026-07-15T10:00:00Z'),
    ]);
    expect(rankedSeriesOrder(s)).toEqual(['main', 'ct1', 'ct2', 'ct3']);
    expect(rankOf(s, 'ct1')).toBe(2);
    expect(rankOf(s, 'ct3')).toBe(4);
  });

  test('assigning an occupied rank swaps the two CTs', () => {
    let s = withCts('week', [
      Date.parse('2026-08-15T10:00:00Z'),
      Date.parse('2026-08-01T10:00:00Z'),
      Date.parse('2026-07-15T10:00:00Z'),
    ]);
    s = must(assignCtRank(s, 'ct3', 2));
    expect(rankOf(s, 'ct3')).toBe(2);
    expect(rankOf(s, 'ct1')).toBe(4);
    expect(rankOf(s, 'ct2')).toBe(3);
    expect(rankedSeriesOrder(s)).toEqual(['main', 'ct3', 'ct2', 'ct1']);
  });

  test('rank 1 can never be assigned to a CT', () => {
    const s = withCts('week', [AUG_ANCHOR]);
    // @ts-expect-error rank 1 is not a valid CT rank at the type level.
    const bad = assignCtRank(s, 'ct1', 1);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe('invalid_rank');
  });

  test('removing a CT re-packs remaining ranks to contiguous unique 2..N', () => {
    let s = withCts('week', [
      Date.parse('2026-08-15T10:00:00Z'),
      Date.parse('2026-08-01T10:00:00Z'),
      Date.parse('2026-07-15T10:00:00Z'),
    ]);
    s = must(removeCompareTicker(s, 'ct1'));
    expect(s.cts.map((c) => c.rank).sort()).toEqual([2, 3]);
    expect(rankedSeriesOrder(s)).toEqual(['main', 'ct2', 'ct3']);
  });

  test('pointer ownership at a crossing goes to the highest rank', () => {
    const s = withCts('week', [Date.parse('2026-08-15T10:00:00Z'), Date.parse('2026-08-01T10:00:00Z')]);
    expect(resolvePointerOwner(s, ['ct2', 'ct1'])).toBe('ct1');
    expect(resolvePointerOwner(s, ['ct2', 'main'])).toBe('main');
    expect(resolvePointerOwner(s, [])).toBeNull();
  });

  test('reveal order equals rank order', () => {
    const s = withCts('week', [Date.parse('2026-08-15T10:00:00Z'), Date.parse('2026-08-01T10:00:00Z')]);
    expect(revealOrder(s)).toEqual(rankedSeriesOrder(s));
    expect(revealOrder(s)).toEqual(['main', 'ct1', 'ct2']);
  });
});

test.describe('R042 compare mode — progression / dates / transparency never reorder', () => {
  test('progression, layout, intro, and anchor changes do not touch order', () => {
    let s = withCts('week', [
      Date.parse('2026-08-15T10:00:00Z'),
      Date.parse('2026-08-01T10:00:00Z'),
      Date.parse('2026-07-15T10:00:00Z'),
    ]);
    const baseline = rankedSeriesOrder(s);

    s = must(setCtProgression(s, 'ct3', 'promoted'));
    s = promoteAllCts(s);
    s = parkAllCts(s);
    s = setCompareLayout(s, 'merge');
    s = markIntroSeen(s);
    s = must(setCtAnchor(s, 'ct1', Date.parse('2026-06-01T10:00:00Z'), NOW));
    s = must(stepCtPeriod(s, 'ct2', 'prev', NOW));

    expect(rankedSeriesOrder(s)).toEqual(baseline);
    expect(revealOrder(s)).toEqual(baseline);
  });
});

test.describe('R042 compare mode — game-link truthfulness', () => {
  test('a real game id yields Open game and Trainer review targets', () => {
    const links = compareEventLinks({ gameId: 'g-123' });
    expect(links.openGameHref).toBe('/finished/g-123');
    expect(links.trainerReviewHref).toBe('/finished/g-123/train');
    expect(canLinkCompareEvent({ gameId: 'g-123' })).toBe(true);
  });

  test('missing/blank game ids never produce fabricated links', () => {
    for (const gameId of [null, undefined, '', '   ']) {
      const links = compareEventLinks({ gameId: gameId as string | null | undefined });
      expect(links.openGameHref).toBeNull();
      expect(links.trainerReviewHref).toBeNull();
      expect(canLinkCompareEvent({ gameId: gameId as string | null | undefined })).toBe(false);
    }
  });
});

/* ================================================================== *
 * Stack 1 correction regressions
 * ================================================================== */

test.describe('R042 correction 1 — UTC day-open reset contract', () => {
  test('utcDayKey is a UTC calendar day, independent of clock time within it', () => {
    expect(utcDayKey(NOW)).toBe(NOW_DAY_KEY);
    expect(utcDayKey(Date.parse('2026-09-07T23:59:59Z'))).toBe('2026-09-07');
    expect(utcDayKey(Date.parse('2026-09-08T00:00:01Z'))).toBe('2026-09-08');
    expect(utcDayKey(Number.NaN)).toBeNull();
  });

  test('same-day reopen is non-destructive', () => {
    const s = withCts('week', [AUG_ANCHOR, Date.parse('2026-08-01T10:00:00Z')]);
    const reopened = reopenCompareSessionForUtcDay(s, Date.parse('2026-09-07T20:00:00Z'));
    expect(reopened).toBe(s); // identity — nothing rebuilt
    expect(reopened.cts).toHaveLength(2);
    expect(reopened.openedUtcDayKey).toBe(NOW_DAY_KEY);
  });

  test('next-day reopen resets the session and re-stamps the day, preserving lane', () => {
    let s = withCts('week', [AUG_ANCHOR]);
    s = setCompareLayout(s, 'merge');
    s = markIntroSeen(s);
    const reopened = reopenCompareSessionForUtcDay(s, Date.parse('2026-09-08T00:05:00Z'));
    expect(reopened.cts).toHaveLength(0);
    expect(reopened.layout).toBe('independent');
    expect(reopened.introSeen).toBe(false);
    expect(reopened.lane).toBe('week');
    expect(reopened.openedUtcDayKey).toBe('2026-09-08');
  });

  test('midnight passing while already open never disrupts the session', () => {
    const s = withCts('week', [AUG_ANCHOR, Date.parse('2026-08-01T10:00:00Z')]);
    // No reopen is called as the boundary passes — the open session is untouched.
    // The next reopen still on the same UTC day is likewise a no-op.
    const stillOpen = reopenCompareSessionForUtcDay(s, Date.parse('2026-09-07T23:59:59Z'));
    expect(stillOpen).toBe(s);
    expect(stillOpen.cts).toHaveLength(2);
  });

  test('non-finite now leaves the session unchanged (no reliable clock)', () => {
    const s = withCts('week', [AUG_ANCHOR]);
    expect(reopenCompareSessionForUtcDay(s, Number.NaN)).toBe(s);
  });

  test('unconditional resetCompareSession clears and re-stamps but cannot touch prefs', () => {
    const prefs = createDefaultVisualPreferences();
    const s = withCts('week', [AUG_ANCHOR]);
    const reset = resetCompareSession(s, Date.parse('2026-09-08T00:05:00Z'));
    expect(reset.cts).toHaveLength(0);
    expect(reset.openedUtcDayKey).toBe('2026-09-08');
    expect(prefs).toEqual({ preset: 'default' }); // separate model, untouched
  });
});

test.describe('R042 correction 2 — no rank gaps', () => {
  test('a single CT stays at rank 2 and cannot jump to a gap', () => {
    const s = withCts('week', [AUG_ANCHOR]);
    expect(rankOf(s, 'ct1')).toBe(2);
    const jump = assignCtRank(s, 'ct1', 4);
    expect(jump.ok).toBe(false);
    if (!jump.ok) expect(jump.reason).toBe('rank_gap');
    expect(moveCtRank(s, 'ct1', 'down').ok).toBe(false); // no rank 3 to swap with
    expect(rankOf(s, 'ct1')).toBe(2);
  });

  test('two CTs occupy exactly 2 and 3; a noncontiguous assign is rejected', () => {
    const s = withCts('week', [AUG_ANCHOR, Date.parse('2026-08-01T10:00:00Z')]);
    expect([rankOf(s, 'ct1'), rankOf(s, 'ct2')].sort()).toEqual([2, 3]);
    const gap = assignCtRank(s, 'ct1', 4);
    expect(gap.ok).toBe(false);
    if (!gap.ok) expect(gap.reason).toBe('rank_gap');
    // Occupied-rank assignment still swaps.
    const swapped = must(assignCtRank(s, 'ct1', 3));
    expect(rankOf(swapped, 'ct1')).toBe(3);
    expect(rankOf(swapped, 'ct2')).toBe(2);
  });
});

test.describe('R042 correction 3 — rating events vs real games', () => {
  test('isRealGameEvent / countRealGames exclude non-game ledger events', () => {
    const pts = [
      point({ id: 'g1', occurredAt: '2026-08-05T10:00:00Z', eventType: 'game', gameId: 'g1' }),
      point({ id: 'b1', occurredAt: '2026-08-06T10:00:00Z', eventType: 'tournament_batch', gameId: null }),
      point({ id: 's1', occurredAt: '2026-08-07T10:00:00Z', eventType: 'bracket_settlement', gameId: null }),
    ];
    expect(isRealGameEvent(pts[0])).toBe(true);
    expect(isRealGameEvent(pts[1])).toBe(false);
    expect(countRealGames(pts)).toBe(1);
  });

  test('occupancy preserves non-game movement but counts only real games', () => {
    const augustMonth = compareAnchorPeriod('month', AUG_ANCHOR)!;
    const pts = [
      point({ id: 'g1', occurredAt: '2026-08-05T10:00:00Z', eventType: 'game', gameId: 'g1', ratingBefore: 1500, ratingAfter: 1512 }),
      point({ id: 'batch', occurredAt: '2026-08-20T10:00:00Z', eventType: 'tournament_batch', gameId: null, result: 'event_settlement', ratingBefore: 1512, ratingAfter: 1530 }),
    ];
    const occ = periodOccupancy(pts, augustMonth);
    expect(occ.ratingEvents).toBe(2); // both drive chart movement
    expect(occ.games).toBe(1); // only the real game counts
    expect(occ.netRatingChange).toBe(30); // 1530 - 1500 across all events
    expect(occ.isEmpty).toBe(false);
  });
});

test.describe('R042 correction 3/7 — authoritative loader-path provenance', () => {
  test('accl_overall ledger rows are mapped into the ACCL track', () => {
    const rows = [ledgerRow({ id: 'L1', occurred_at: '2026-08-10T10:00:00Z', rating_track_id: 'accl_overall' })];
    const points = buildRatingHistoryPointsFromLedger(rows, 'u1', 'accl');
    expect(points).toHaveLength(1);
    expect(points[0].ratingTrackId).toBe('accl');
  });

  test('non-game ledger events survive as rating events but never count as games', () => {
    const rows = [
      ledgerRow({ id: 'L1', occurred_at: '2026-08-10T10:00:00Z', rating_track_id: 'accl_overall', event_type: 'game', game_id: 'g-real' }),
      ledgerRow({ id: 'L2', occurred_at: '2026-08-11T10:00:00Z', rating_track_id: 'accl_overall', event_type: 'tournament_batch', game_id: null, result: 'event_settlement' }),
    ];
    const points = buildRatingHistoryPointsFromLedger(rows, 'u1', 'accl');
    expect(points).toHaveLength(2); // both preserved for movement
    expect(countRealGames(points)).toBe(1); // only the real game
    expect(canLinkCompareEvent(points[0])).toBe(true); // has a game id
    expect(canLinkCompareEvent(points[1])).toBe(false); // non-game event, no link
  });
});

test.describe('R042 correction 4 — Overall disables ordering / reveal / pointer', () => {
  test('disabled CTs never leak into ordering, reveal, or pointer resolution', () => {
    let s = withCts('week', [AUG_ANCHOR, Date.parse('2026-08-01T10:00:00Z')]);
    s = setMainLane(s, 'overall');

    expect(activeCompareTickers(s)).toHaveLength(0);
    expect(rankedSeriesOrder(s)).toEqual(['main']);
    expect(revealOrder(s)).toEqual(['main']);
    expect(resolvePointerOwner(s, ['ct1', 'ct2', 'main'])).toBe('main');
    expect(resolvePointerOwner(s, ['ct1', 'ct2'])).toBeNull();
    expect(rankOf(s, 'ct1')).toBeNull();
    expect(rankOf(s, MAIN_SERIES_ID)).toBe(1);
  });

  test('anchors are retained internally and restore on returning to a bounded lane', () => {
    let s = withCts('week', [AUG_ANCHOR, Date.parse('2026-08-01T10:00:00Z')]);
    s = setMainLane(s, 'overall');
    s = setMainLane(s, 'week');
    expect(activeCompareTickers(s)).toHaveLength(2);
    expect(rankedSeriesOrder(s)).toEqual(['main', 'ct1', 'ct2']);
  });
});

test.describe('R042 correction 5 — visual preferences do not cement a wrong premium shape', () => {
  test('preferences carry only a free preset; no role-based custom field', () => {
    const prefs = createDefaultVisualPreferences();
    expect(prefs).toEqual({ preset: 'default' });
    expect('custom' in prefs).toBe(false);
  });

  test('free presets resolve to the spec role opacities', () => {
    expect(COMPARE_PRESET_OPACITY.default).toEqual({ main: 100, progressionCt: 90, parkedCt: 30 });
    expect(COMPARE_PRESET_OPACITY.high_contrast).toEqual({ main: 100, progressionCt: 100, parkedCt: 60 });
    expect(COMPARE_PRESET_OPACITY.main_focus).toEqual({ main: 100, progressionCt: 70, parkedCt: 15 });
    expect(COMPARE_PRESET_OPACITY.equal_visibility).toEqual({ main: 100, progressionCt: 100, parkedCt: 100 });
    expect(resolvePresetOpacity({ preset: 'main_focus' })).toEqual({ main: 100, progressionCt: 70, parkedCt: 15 });
  });

  test('session reset and account preferences are independent by type', () => {
    const prefs = createDefaultVisualPreferences();
    const s = withCts('week', [AUG_ANCHOR]);
    reopenCompareSessionForUtcDay(s, Date.parse('2026-09-08T00:05:00Z'));
    expect(prefs).toEqual({ preset: 'default' });
  });
});

test.describe('R042 correction 6 — export floor separate from on-screen resting floor', () => {
  test('floors are distinct: Main 70, CT on-screen 10, CT export 40', () => {
    expect(MAIN_OPACITY_FLOOR).toBe(70);
    expect(CT_ONSCREEN_OPACITY_FLOOR).toBe(10);
    expect(CT_EXPORT_OPACITY_FLOOR).toBe(40);
  });

  test('on-screen clamp lets CTs rest at 10 while keeping Main legible', () => {
    expect(clampOpacityForScreen({ main: 40, progressionCt: 90, parkedCt: 2 })).toEqual({
      main: 70,
      progressionCt: 90,
      parkedCt: 10,
    });
  });

  test('export clamp raises faint CTs to the 40 export floor', () => {
    expect(clampOpacityForExport({ main: 40, progressionCt: 90, parkedCt: 2 })).toEqual({
      main: 70,
      progressionCt: 90,
      parkedCt: 40,
    });
    // Already-legible values are left alone.
    expect(clampOpacityForExport({ main: 100, progressionCt: 60, parkedCt: 55 })).toEqual({
      main: 100,
      progressionCt: 60,
      parkedCt: 55,
    });
  });
});
