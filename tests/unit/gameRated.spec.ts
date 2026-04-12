import { test, expect } from '@playwright/test';

import { gameRatedBannerSuffix, gameRatedListLabel } from '../../lib/gameRated';

test.describe('gameRated', () => {
  test('gameRatedListLabel', () => {
    expect(gameRatedListLabel(true)).toBe('Rated');
    expect(gameRatedListLabel(false)).toBe('Unrated');
    expect(gameRatedListLabel(undefined)).toBe('Unrated');
  });

  test('gameRatedBannerSuffix', () => {
    expect(gameRatedBannerSuffix(true)).toContain('RATED');
    expect(gameRatedBannerSuffix(false)).toContain('UNRATED');
  });
});
