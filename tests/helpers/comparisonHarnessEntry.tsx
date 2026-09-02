'use client';

import { RatingFamilyComparisonPanel } from '@/components/profile/ratings/RatingFamilyComparisonPanel';
import { RatingTrackDetailPanel } from '@/components/profile/ratings/RatingTrackDetailPanel';
import type { RatingHistoryPoint } from '@/lib/ratingHistoryTypes';
import { LANDSCAPE_TICKER_CROSSING_HISTORY } from './landscapeTickerCrossingFixture';

type HarnessOptions = {
  empty?: boolean;
  crossing?: boolean;
  single?: boolean;
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

export function ComparisonHarness() {
  const initial = readOptions();
  const empty = Boolean(initial.empty);
  const crossing = Boolean(initial.crossing);
  const single = Boolean(initial.single);
  const historyByTrack = empty
    ? {}
    : crossing
      ? LANDSCAPE_TICKER_CROSSING_HISTORY
      : buildHistory();

  return (
    <div
      data-testid="comparison-harness"
      data-fixture={empty ? 'empty' : crossing ? 'crossing' : 'default'}
    >
      {single ? (
        <RatingTrackDetailPanel
          trackLabel="Daily Overall"
          ratingTrackId="free_day"
          currentRating={1508}
          points={historyByTrack.free_day ?? []}
          badge={null}
          isSelf
          canLinkFinishedGames
          historyByTrack={historyByTrack}
        />
      ) : (
        <RatingFamilyComparisonPanel historyByTrack={historyByTrack} canLinkFinishedGames />
      )}
    </div>
  );
}
