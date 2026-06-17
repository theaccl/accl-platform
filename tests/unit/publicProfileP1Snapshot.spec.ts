import { test, expect } from '@playwright/test';

import { acclRatingFromP1 } from '../../lib/p1PublicRatingRead';

/**
 * Documents expected get_public_profile_snapshot.p1 shape after O1 migration.
 */
test.describe('public profile snapshot P1 shape', () => {
  test('example p1 object keys match O1 contract', () => {
    const example = {
      accl_rating: 1500,
      accl_overall: { rating: 1500, games_played: 0 },
      tournament_rating: 1620,
      tournament_unified: { rating: 1620, games_played: 12 },
      free_bullet: { rating: 1500, games_played: 0 },
      free_blitz: { rating: 1510, games_played: 2 },
      free_rapid: { rating: 1500, games_played: 0 },
      free_day: { rating: 1500, games_played: 0 },
    };
    expect(example.accl_rating).not.toBe(example.tournament_rating);
    expect(Object.keys(example).sort()).toEqual(
      [
        'accl_overall',
        'accl_rating',
        'free_blitz',
        'free_bullet',
        'free_day',
        'free_rapid',
        'tournament_rating',
        'tournament_unified',
      ].sort(),
    );
  });

  test('missing accl_overall degrades safely without tournament substitution', () => {
    const rating = acclRatingFromP1(
      {
        accl_rating: null,
        accl_overall: null,
        tournament_rating: 1620,
        tournament_unified: { rating: 1620, games_played: 12 },
        free_bullet: null,
        free_blitz: null,
        free_rapid: null,
        free_day: null,
      },
      1550,
    );
    expect(rating).toBe(1550);
  });
});
