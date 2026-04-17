import { test, expect } from '@playwright/test';

/**
 * Documents expected get_public_profile_snapshot.p1 shape after RPC migration T8.
 */
test.describe('public profile snapshot P1 shape', () => {
  test('example p1 object keys match contract', () => {
    const example = {
      accl_rating: 1500,
      tournament_rating: 1500,
      tournament_unified: { rating: 1500, games_played: 0 },
      free_bullet: { rating: 1500, games_played: 0 },
      free_blitz: { rating: 1510, games_played: 2 },
      free_rapid: { rating: 1500, games_played: 0 },
      free_day: { rating: 1500, games_played: 0 },
    };
    expect(example.accl_rating).toBe(example.tournament_rating);
    expect(Object.keys(example).sort()).toEqual(
      [
        'accl_rating',
        'free_blitz',
        'free_bullet',
        'free_day',
        'free_rapid',
        'tournament_rating',
        'tournament_unified',
      ].sort()
    );
  });
});
