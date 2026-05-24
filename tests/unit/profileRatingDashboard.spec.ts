import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildProfileRatingViewModel,
  defaultBucketIdForMode,
  findBucketById,
} from '@/lib/profile/buildProfileRatingViewModel';
import type { RatingGamePointSnapshot } from '@/lib/profile/ratingDashboardTypes';
import {
  bucketHasAuthoritativeRatingHistory,
  hasEnoughRatingChartPoints,
  isRatingGamePointSnapshot,
  ratingTickerPath,
  sortGamePointsChronologically,
  toRatingHistorySeries,
} from '@/lib/profile/ratingHistoryGamePoints';
import type { PublicP1Read } from '@/lib/p1PublicRatingRead';

const validSnapshot: RatingGamePointSnapshot = {
  gameId: 'game-a',
  finishedAt: '2026-05-01T12:00:00.000Z',
  ratingBucket: 'free_blitz',
  mode: 'blitz',
  timeControl: '3+2',
  opponentUsername: 'rival',
  opponentRating: 1280,
  result: 'win',
  ratingBefore: 1200,
  ratingAfter: 1216,
  ratingDelta: 16,
  colorPlayed: 'white',
  source: 'free',
};

const sampleP1: PublicP1Read = {
  accl_rating: 1330,
  tournament_rating: 1275,
  tournament_unified: { rating: 1275, games_played: 42 },
  free_bullet: { rating: 1198, games_played: 120 },
  free_blitz: { rating: 1315, games_played: 248 },
  free_rapid: { rating: 1402, games_played: 96 },
  free_day: { rating: 1160, games_played: 18 },
};

test.describe('profile rating dashboard view model', () => {
  test('builds six top-level rating cards from P1 snapshot', () => {
    const model = buildProfileRatingViewModel(sampleP1);
    expect(model.topCards).toHaveLength(6);
    expect(model.topCards.map((c) => c.mode)).toEqual([
      'accl',
      'tournament',
      'bullet',
      'blitz',
      'rapid',
      'daily',
    ]);
    expect(model.topCards[3]?.currentRating).toBe(1315);
    expect(model.topCards[3]?.gamesPlayed).toBe(248);
  });

  test('does not fabricate rating history or per-time-control ratings', () => {
    const model = buildProfileRatingViewModel(sampleP1);
    for (const card of model.topCards) {
      expect(card.history).toBeUndefined();
      expect(card.sparkline).toBeUndefined();
      expect(card.peak).toBeNull();
    }
    const blitz32 = findBucketById(model, 'blitz-3-2');
    expect(blitz32?.inheritsModeBucket).toBe(true);
    expect(blitz32?.currentRating).toBeNull();
    expect(blitz32?.history).toBeUndefined();
  });

  test('blitz mode exposes overall and child time controls', () => {
    const model = buildProfileRatingViewModel(sampleP1);
    const blitz = model.bucketsByMode.blitz;
    expect(blitz.length).toBeGreaterThan(1);
    expect(blitz[0]?.isOverall).toBe(true);
    expect(blitz[0]?.currentRating).toBe(1315);
    expect(defaultBucketIdForMode('blitz', model)).toBe('blitz-overall');
  });
});

test.describe('profile rating dashboard (static)', () => {
  test('doctrine documents game-by-game chart points', () => {
    const doctrine = readFileSync(
      join(process.cwd(), 'docs/profile/PROFILE_RATING_DASHBOARD_DOCTRINE.md'),
      'utf8',
    );
    expect(doctrine).toContain('chess stock ticker');
    expect(doctrine).toContain('RatingGamePointSnapshot');
    expect(doctrine).toContain('Do not fake data');
    expect(doctrine).toContain('/ratings/[bucketId]/ticker');
  });

  test('public profile page wires ProfileRatingDashboard', () => {
    const page = readFileSync(join(process.cwd(), 'app/profile/[id]/page.tsx'), 'utf8');
    const dashboard = readFileSync(
      join(process.cwd(), 'components/profile/ratings/ProfileRatingDashboard.tsx'),
      'utf8',
    );
    expect(page).toContain('ProfileRatingDashboard');
    expect(dashboard).toContain('data-testid="profile-rating-dashboard"');
    expect(dashboard).not.toContain('game-replay-panel');
  });
});

test.describe('rating history game points', () => {
  test('validates authoritative snapshot shape and delta consistency', () => {
    expect(isRatingGamePointSnapshot(validSnapshot)).toBe(true);
    expect(
      isRatingGamePointSnapshot({ ...validSnapshot, ratingDelta: 99 }),
    ).toBe(false);
  });

  test('sorts chronologically and builds series', () => {
    const later: RatingGamePointSnapshot = {
      ...validSnapshot,
      gameId: 'game-b',
      finishedAt: '2026-05-02T12:00:00.000Z',
      ratingBefore: 1216,
      ratingAfter: 1198,
      ratingDelta: -18,
      result: 'loss',
    };
    const series = toRatingHistorySeries('blitz-overall', [later, validSnapshot]);
    expect(series?.points[0]?.gameId).toBe('game-a');
    expect(sortGamePointsChronologically([later, validSnapshot])[0]?.gameId).toBe('game-a');
  });

  test('bucket history requires every point to be authoritative', () => {
    const model = buildProfileRatingViewModel(sampleP1);
    const blitz = findBucketById(model, 'blitz-overall')!;
    expect(bucketHasAuthoritativeRatingHistory(blitz)).toBe(false);

    const withHistory = {
      ...blitz,
      history: [validSnapshot, { ...validSnapshot, gameId: 'game-b', ratingDelta: 0, ratingAfter: 1216, ratingBefore: 1216, result: 'draw' as const, finishedAt: '2026-05-02T12:00:00.000Z' }],
    };
    expect(bucketHasAuthoritativeRatingHistory(withHistory)).toBe(true);
    expect(hasEnoughRatingChartPoints(withHistory.history!)).toBe(true);
  });

  test('rating ticker path is per bucket', () => {
    expect(ratingTickerPath('user-1', 'blitz-3-2')).toBe('/profile/user-1/ratings/blitz-3-2/ticker');
  });
});
