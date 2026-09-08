import { expect, test } from '@playwright/test';

import {
  activeCompareTickers,
  addCompareTicker,
  assignCtRank,
  canLinkCompareEvent,
  clampOpacityForExport,
  compareAnchorPeriod,
  compareEventLinks,
  COMPARE_PRESET_OPACITY,
  createCompareSession,
  createDefaultVisualPreferences,
  ctPeriod,
  isAnchorSelectable,
  isCompareEnabled,
  isPeriodSelectable,
  markIntroSeen,
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
  resetCompareSessionForNewUtcDay,
  resolvePresetOpacity,
  resolvePointerOwner,
  revealOrder,
  setCompareLayout,
  setCtAnchor,
  setCtProgression,
  setMainLane,
  stepCtPeriod,
  type CompareOpResult,
  type CompareSessionState,
} from '../../lib/profile/compareMode';
import type { RatingHistoryPoint } from '../../lib/ratingHistoryTypes';

const NOW = Date.parse('2026-09-07T12:00:00Z');
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

/** Unwrap a successful op or fail the test loudly. */
function must(result: CompareOpResult): CompareSessionState {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return result.state;
}

/** Build a session with N CTs anchored in the past. */
function withCts(lane: CompareSessionState['lane'], anchors: number[]): CompareSessionState {
  let s = createCompareSession(lane);
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
    // No CT can hold rank 1.
    expect(s.cts.every((c) => c.rank >= 2)).toBe(true);
  });

  test('Overall rejects adding CTs and hides active CTs but retains anchors', () => {
    let s = withCts('week', [AUG_ANCHOR]);
    s = setMainLane(s, 'overall');
    const rejected = addCompareTicker(s, AUG_ANCHOR, NOW);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.reason).toBe('compare_disabled_overall');
    expect(activeCompareTickers(s)).toHaveLength(0);
    expect(ctPeriod(s, 'ct1')).toBeNull();
    // Returning to a bounded lane restores the retained CT, re-bucketed.
    s = setMainLane(s, 'week');
    expect(activeCompareTickers(s)).toHaveLength(1);
    expect(ctPeriod(s, 'ct1')?.lane).toBe('week');
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
    const p1 = ctPeriod(s, 'ct1');
    const p2 = ctPeriod(s, 'ct2');
    const p3 = ctPeriod(s, 'ct3');
    expect(p1?.startMs).not.toBe(p2?.startMs);
    expect(p2?.startMs).not.toBe(p3?.startMs);
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

    // 2026-08-15 is a Saturday → ISO week Monday is 2026-08-10.
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

    const asDay = ctPeriod(s, 'ct1')!;
    expect(asDay.startMs).toBe(Date.parse('2026-08-15T00:00:00Z'));

    s = setMainLane(s, 'month');
    const asMonth = ctPeriod(s, 'ct1')!;
    expect(asMonth.startMs).toBe(Date.parse('2026-08-01T00:00:00Z'));

    s = setMainLane(s, 'year');
    const asYear = ctPeriod(s, 'ct1')!;
    expect(asYear.startMs).toBe(Date.parse('2026-01-01T00:00:00Z'));

    // Anchor instant is never rewritten by re-bucketing.
    expect(s.cts[0].anchorMs).toBe(anchorBefore);
  });
});

test.describe('R042 compare mode — future periods prohibited', () => {
  test('a future month anchor cannot be added', () => {
    const s = createCompareSession('month');
    const future = addCompareTicker(s, Date.parse('2026-10-01T00:00:00Z'), NOW);
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.reason).toBe('future_period');
  });

  test('the current period (containing now) is selectable', () => {
    const s = createCompareSession('day');
    const today = addCompareTicker(s, Date.parse('2026-09-07T00:00:00Z'), NOW);
    expect(today.ok).toBe(true);
    expect(isAnchorSelectable('month', NOW, NOW)).toBe(true);
  });

  test('isPeriodSelectable rejects a wholly-future period', () => {
    const oct = compareAnchorPeriod('month', Date.parse('2026-10-15T00:00:00Z'))!;
    expect(isPeriodSelectable(oct, NOW)).toBe(false);
    const aug = compareAnchorPeriod('month', AUG_ANCHOR)!;
    expect(isPeriodSelectable(aug, NOW)).toBe(true);
  });

  test('stepping Next into the future is rejected; Prev/Next within the past works', () => {
    let s = withCts('month', [AUG_ANCHOR]); // August
    // Next → September (contains now) is allowed.
    s = must(stepCtPeriod(s, 'ct1', 'next', NOW));
    expect(ctPeriod(s, 'ct1')?.startMs).toBe(Date.parse('2026-09-01T00:00:00Z'));
    // Next again → October is a future period.
    const toOct = stepCtPeriod(s, 'ct1', 'next', NOW);
    expect(toOct.ok).toBe(false);
    if (!toOct.ok) expect(toOct.reason).toBe('future_period');
    // Prev → back to August.
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

  test('no in-window games and no prior event → truly empty (draw nothing)', () => {
    const occ = periodOccupancy([], augustDay);
    expect(occ.games).toBe(0);
    expect(occ.carryInRating).toBeNull();
    expect(occ.isEmpty).toBe(true);
    expect(occ.isCarryInHold).toBe(false);
    expect(occ.netRatingChange).toBeNull();
  });

  test('no in-window games but a real prior event → carry-in hold, no markers', () => {
    const prior = [point({ id: 'p0', occurredAt: '2026-07-20T00:00:00Z', ratingAfter: 1544 })];
    const occ = periodOccupancy(prior, augustDay);
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
    expect(occ.games).toBe(2);
    expect(occ.netRatingChange).toBe(60);
    expect(occ.isEmpty).toBe(false);
    expect(occ.isCarryInHold).toBe(false);
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
    s = must(assignCtRank(s, 'ct3', 2)); // ct3 → 2, ct1 (had 2) → 4
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

  test('mobile up/down cycles ranks and is a no-op at the edges', () => {
    let s = withCts('week', [
      Date.parse('2026-08-15T10:00:00Z'),
      Date.parse('2026-08-01T10:00:00Z'),
    ]);
    // ct1=2, ct2=3. Up on ct1 (already top CT) → no-op.
    expect(moveCtRank(s, 'ct1', 'up').ok).toBe(false);
    s = must(moveCtRank(s, 'ct1', 'down')); // swap with ct2
    expect(rankOf(s, 'ct1')).toBe(3);
    expect(rankOf(s, 'ct2')).toBe(2);
  });

  test('removing a CT re-packs remaining ranks to contiguous unique 2..N', () => {
    let s = withCts('week', [
      Date.parse('2026-08-15T10:00:00Z'),
      Date.parse('2026-08-01T10:00:00Z'),
      Date.parse('2026-07-15T10:00:00Z'),
    ]);
    s = must(removeCompareTicker(s, 'ct1')); // remove rank 2
    const ranks = s.cts.map((c) => c.rank).sort();
    expect(ranks).toEqual([2, 3]);
    expect(rankedSeriesOrder(s)).toEqual(['main', 'ct2', 'ct3']);
  });

  test('pointer ownership at a crossing goes to the highest rank', () => {
    const s = withCts('week', [
      Date.parse('2026-08-15T10:00:00Z'),
      Date.parse('2026-08-01T10:00:00Z'),
    ]);
    expect(resolvePointerOwner(s, ['ct2', 'ct1'])).toBe('ct1'); // ct1 rank 2 wins
    expect(resolvePointerOwner(s, ['ct2', 'main'])).toBe('main'); // Main always wins
    expect(resolvePointerOwner(s, [])).toBeNull();
  });

  test('reveal order equals rank order', () => {
    const s = withCts('week', [
      Date.parse('2026-08-15T10:00:00Z'),
      Date.parse('2026-08-01T10:00:00Z'),
    ]);
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

test.describe('R042 compare mode — UTC reset vs account visual preferences', () => {
  test('daily reset clears session but preserves the Main lane', () => {
    let s = withCts('week', [AUG_ANCHOR, Date.parse('2026-08-01T10:00:00Z')]);
    s = setCompareLayout(s, 'merge');
    s = markIntroSeen(s);
    s = promoteAllCts(s);

    const reset = resetCompareSessionForNewUtcDay(s);
    expect(reset.cts).toHaveLength(0);
    expect(reset.layout).toBe('independent');
    expect(reset.introSeen).toBe(false);
    expect(reset.lane).toBe('week'); // lane is a chart-window choice, not session data
  });

  test('account visual preferences are a separate model untouched by reset', () => {
    const prefs = createDefaultVisualPreferences();
    // The reset function’s signature cannot even receive prefs — separation by type.
    const s = withCts('week', [AUG_ANCHOR]);
    resetCompareSessionForNewUtcDay(s);
    expect(prefs).toEqual({ preset: 'default' });
  });

  test('preset opacities match the specification verbatim', () => {
    expect(COMPARE_PRESET_OPACITY.default).toEqual({ main: 100, progressionCt: 90, parkedCt: 30 });
    expect(COMPARE_PRESET_OPACITY.high_contrast).toEqual({ main: 100, progressionCt: 100, parkedCt: 60 });
    expect(COMPARE_PRESET_OPACITY.main_focus).toEqual({ main: 100, progressionCt: 70, parkedCt: 15 });
    expect(COMPARE_PRESET_OPACITY.equal_visibility).toEqual({ main: 100, progressionCt: 100, parkedCt: 100 });
  });

  test('resolve + export clamp keep Main legible and floor faint CTs', () => {
    expect(resolvePresetOpacity({ preset: 'main_focus' })).toEqual({ main: 100, progressionCt: 70, parkedCt: 15 });
    expect(resolvePresetOpacity({ preset: 'custom', custom: { main: 80, progressionCt: 40, parkedCt: 5 } })).toEqual({
      main: 80,
      progressionCt: 40,
      parkedCt: 5,
    });
    // Custom without values falls back to Default.
    expect(resolvePresetOpacity({ preset: 'custom' })).toEqual(COMPARE_PRESET_OPACITY.default);
    // Export clamp: Main floored to 70, faint CT floored to 10.
    expect(clampOpacityForExport({ main: 40, progressionCt: 90, parkedCt: 2 })).toEqual({
      main: 70,
      progressionCt: 90,
      parkedCt: 10,
    });
  });
});
