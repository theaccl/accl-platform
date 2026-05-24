import { expect, test } from '@playwright/test';
import {
  buildProfileRatingViewModel,
  defaultBucketIdForMode,
  findBucketById,
} from '@/lib/profile/buildProfileRatingViewModel';
import type { PublicP1Read } from '@/lib/p1PublicRatingRead';

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
  test('public profile page wires ProfileRatingDashboard', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
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
