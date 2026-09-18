'use client';

import { useCallback, useMemo, useState } from 'react';
import { RatingFamilyComparisonPanel } from '@/components/profile/ratings/RatingFamilyComparisonPanel';
import { RatingTrackDetailPanel } from '@/components/profile/ratings/RatingTrackDetailPanel';
import { RatingLaneTabs } from '@/components/profile/ratings/RatingLaneTabs';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';
import { LANDSCAPE_TICKER_CROSSING_HISTORY } from './landscapeTickerCrossingFixture';
import type { ComparePeriod } from '@/lib/profile/compareMode';
import type { CompareTickerPeriodLoad } from '@/lib/profile/loadCompareTickerPeriod';
import { DEFAULT_RATING_LANE, type RatingLane } from '@/lib/ratingHistoryMetrics';

type HarnessOptions = {
  empty?: boolean;
  crossing?: boolean;
  single?: boolean;
  accl?: boolean;
  compareCoverage?: 'complete' | 'incomplete';
  mainCompareCoverage?: 'complete' | 'incomplete';
  compareAdjustment?: boolean;
  compareLoadDelayMs?: number;
  switchableTrack?: boolean;
};

function readOptions(): HarnessOptions {
  const fromWindow =
    typeof window !== 'undefined'
      ? (window as Window & { __HARNESS_OPTIONS?: HarnessOptions }).__HARNESS_OPTIONS
      : undefined;
  return fromWindow ?? {};
}

function point(
  partial: Partial<RatingHistoryPoint> & { id: string; ratingTrackId: string },
): RatingHistoryPoint {
  return {
    playerId: 'u1',
    ecosystem: 'free',
    eventType: 'game',
    result: 'win',
    ratingBefore: 1500,
    ratingAfter: 1510,
    ratingDelta: 10,
    occurredAt: '2026-08-18T12:00:00Z',
    ...partial,
  };
}

function buildHistory(): Record<string, RatingHistoryPoint[]> {
  return {
    accl: [
      point({
        id: 'a-1',
        ratingTrackId: 'accl',
        ratingBefore: 1490,
        ratingAfter: 1505,
        ratingDelta: 15,
        occurredAt: '2026-08-12T12:00:00Z',
        gameId: 'g-a-1',
      }),
    ],
    tournament: [
      point({
        id: 't-1',
        ratingTrackId: 'tournament',
        ratingBefore: 1550,
        ratingAfter: 1570,
        ratingDelta: 20,
        occurredAt: '2026-08-10T12:00:00Z',
        gameId: 'g-t-1',
      }),
      point({
        id: 't-2',
        ratingTrackId: 'tournament',
        ratingBefore: 1570,
        ratingAfter: 1562,
        ratingDelta: -8,
        occurredAt: '2026-08-17T12:00:00Z',
        gameId: 'g-t-2',
      }),
    ],
    free_bullet: [
      point({
        id: 'bu-1',
        ratingTrackId: 'free_bullet',
        ratingBefore: 1420,
        ratingAfter: 1433,
        ratingDelta: 13,
        occurredAt: '2026-08-14T12:00:00Z',
        gameId: 'g-bu-1',
      }),
    ],
    free_blitz: [
      point({
        id: 'bz-1',
        ratingTrackId: 'free_blitz',
        ratingBefore: 1510,
        ratingAfter: 1522,
        ratingDelta: 12,
        occurredAt: '2026-08-11T12:00:00Z',
        gameId: 'g-bz-1',
      }),
      point({
        id: 'bz-2',
        ratingTrackId: 'free_blitz',
        ratingBefore: 1522,
        ratingAfter: 1511,
        ratingDelta: -11,
        occurredAt: '2026-08-18T12:00:00Z',
        gameId: 'g-bz-2',
      }),
    ],
    free_rapid: [
      point({
        id: 'r-1',
        ratingTrackId: 'free_rapid',
        ratingBefore: 1488,
        ratingAfter: 1499,
        ratingDelta: 11,
        occurredAt: '2026-08-13T12:00:00Z',
        gameId: 'g-r-1',
      }),
    ],
    free_day: [
      point({
        id: 'd-1',
        ratingTrackId: 'free_day',
        ratingBefore: 1500,
        ratingAfter: 1508,
        ratingDelta: 8,
        occurredAt: '2026-08-01T12:00:00Z',
        gameId: 'g-d-1',
      }),
    ],
  };
}

function harnessPeriodLoader(
  history: RatingHistoryPoint[],
  period: ComparePeriod,
  coverage: 'complete' | 'incomplete' = 'complete',
  delayMs = 0,
): Promise<CompareTickerPeriodLoad> {
  const result: CompareTickerPeriodLoad = {
    status: coverage,
    points: history,
    coverage: {
      startMs: period.startMs,
      endMs: coverage === 'complete' ? period.endMs : period.startMs,
      priorToStartResolved: coverage === 'complete',
    },
    ...(coverage === 'incomplete' ? { message: 'Fixture coverage is incomplete.' } : {}),
  };
  return delayMs > 0
    ? new Promise((resolve) => window.setTimeout(() => resolve(result), delayMs))
    : Promise.resolve(result);
}

export function ComparisonHarness() {
  const initial = readOptions();
  const [alternateTrack, setAlternateTrack] = useState(false);
  const [lane, setLane] = useState<RatingLane>(DEFAULT_RATING_LANE);
  const [compareLoadCount, setCompareLoadCount] = useState(0);
  const empty = Boolean(initial.empty);
  const crossing = Boolean(initial.crossing);
  const single = Boolean(initial.single);
  const accl = Boolean(initial.accl);
  const historyByTrack = useMemo(
    () => empty
      ? {}
      : crossing
        ? LANDSCAPE_TICKER_CROSSING_HISTORY
        : buildHistory(),
    [crossing, empty],
  );
  const selectedTrackId = accl ? 'accl' : alternateTrack ? 'free_blitz' : 'free_day';
  const selectedTrackLabel = accl ? 'ACCL Rating' : alternateTrack ? 'Blitz Overall' : 'Daily Overall';
  const comparePeriodLoader = useCallback(
    (period: ComparePeriod, seriesId: 'main' | 'ct1' | 'ct2' | 'ct3') => {
      setCompareLoadCount((count) => count + 1);
      return harnessPeriodLoader(
        initial.compareAdjustment
          ? [point({
              id: 'preview-adjustment',
              ratingTrackId: selectedTrackId,
              eventType: 'manual_admin_adjustment',
              result: 'draw',
              gameId: 'stray-adjustment-game-id',
              occurredAt: '2026-08-29T20:00:00Z',
              ratingBefore: 1510,
              ratingAfter: 1522,
              ratingDelta: 12,
            })]
          : historyByTrack[selectedTrackId] ?? [],
        period,
        seriesId === 'main' ? initial.mainCompareCoverage : initial.compareCoverage,
        initial.compareLoadDelayMs,
      );
    },
    [
      historyByTrack,
      initial.compareAdjustment,
      initial.compareCoverage,
      initial.compareLoadDelayMs,
      initial.mainCompareCoverage,
      selectedTrackId,
    ],
  );

  return (
    <div
      data-testid="comparison-harness"
      data-fixture={empty ? 'empty' : crossing ? 'crossing' : 'default'}
      data-compare-load-count={compareLoadCount}
    >
      {single ? (
        <>
          {initial.switchableTrack ? (
            <button type="button" data-testid="switch-rating-track" onClick={() => setAlternateTrack((value) => !value)}>
              Switch rating track
            </button>
          ) : null}
          <RatingTrackDetailPanel
            trackLabel={selectedTrackLabel}
            ratingTrackId={selectedTrackId}
            currentRating={accl ? 1505 : alternateTrack ? 1511 : 1508}
            points={historyByTrack[selectedTrackId] ?? []}
            badge={null}
            isSelf
            canLinkFinishedGames
            historyByTrack={historyByTrack}
            comparePeriodLoader={comparePeriodLoader}
            lane={lane}
            onLaneChange={setLane}
          />
        </>
      ) : (
        <>
          <RatingLaneTabs
            lane={lane}
            onLaneChange={setLane}
            testIdPrefix="rating"
            ariaLabel="Main rating history window"
          />
          <RatingFamilyComparisonPanel
            historyByTrack={historyByTrack}
            canLinkFinishedGames
            lane={lane}
          />
        </>
      )}
    </div>
  );
}
