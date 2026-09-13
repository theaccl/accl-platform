/**
 * Test-only histories for carry-in-only drawable dominance.
 * Not production ledger data. Month lane at 2026-08-21:
 * Rapid has in-window events; Blitz/Daily are pre-window holds; ACCL is history-empty.
 */

import type { RatingHistoryPoint } from '../../lib/ratingHistoryTypes';

function seed(
  partial: Partial<RatingHistoryPoint> & {
    id: string;
    ratingTrackId: RatingHistoryPoint['ratingTrackId'];
    occurredAt: string;
    ratingBefore: number;
    ratingAfter: number;
    ratingDelta: number;
  },
): RatingHistoryPoint {
  return {
    playerId: 'carry-in-fixture',
    ecosystem: 'free',
    eventType: 'game',
    result: 'win',
    gameId: `g-${partial.id}`,
    ...partial,
  };
}

/** Rapid in-window (August), Blitz + Daily carry-in-only, ACCL empty. */
export const LANDSCAPE_TICKER_CARRY_IN_HISTORY: Record<string, RatingHistoryPoint[]> = {
  free_rapid: [
    seed({
      id: 'ci-rp-1',
      ratingTrackId: 'free_rapid',
      ratingBefore: 1490,
      ratingAfter: 1500,
      ratingDelta: 10,
      occurredAt: '2026-08-10T12:00:00Z',
    }),
    seed({
      id: 'ci-rp-2',
      ratingTrackId: 'free_rapid',
      ratingBefore: 1500,
      ratingAfter: 1500,
      ratingDelta: 0,
      occurredAt: '2026-08-18T15:00:00Z',
    }),
  ],
  free_blitz: [
    seed({
      id: 'ci-bz-1',
      ratingTrackId: 'free_blitz',
      ratingBefore: 1510,
      ratingAfter: 1520,
      ratingDelta: 10,
      occurredAt: '2026-07-12T12:00:00Z',
    }),
    seed({
      id: 'ci-bz-2',
      ratingTrackId: 'free_blitz',
      ratingBefore: 1520,
      ratingAfter: 1500,
      ratingDelta: -20,
      occurredAt: '2026-07-20T12:00:00Z',
    }),
  ],
  free_day: [
    seed({
      id: 'ci-dy-1',
      ratingTrackId: 'free_day',
      ratingBefore: 1488,
      ratingAfter: 1494,
      ratingDelta: 6,
      occurredAt: '2026-06-15T12:00:00Z',
    }),
  ],
};

/** Rapid carry-in-only (July), Blitz has in-window August events. */
export const LANDSCAPE_TICKER_CARRY_IN_RAPID_HISTORY: Record<string, RatingHistoryPoint[]> = {
  free_rapid: [
    seed({
      id: 'cir-rp-1',
      ratingTrackId: 'free_rapid',
      ratingBefore: 1490,
      ratingAfter: 1500,
      ratingDelta: 10,
      occurredAt: '2026-07-08T12:00:00Z',
    }),
  ],
  free_blitz: [
    seed({
      id: 'cir-bz-1',
      ratingTrackId: 'free_blitz',
      ratingBefore: 1492,
      ratingAfter: 1510,
      ratingDelta: 18,
      occurredAt: '2026-08-12T12:00:00Z',
    }),
    seed({
      id: 'cir-bz-2',
      ratingTrackId: 'free_blitz',
      ratingBefore: 1510,
      ratingAfter: 1524,
      ratingDelta: 14,
      occurredAt: '2026-08-19T12:00:00Z',
    }),
  ],
};
