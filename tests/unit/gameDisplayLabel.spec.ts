import { test, expect } from '@playwright/test';

import { gameDisplaySourceLabel, gameModeBannerLabel } from '../../lib/gameDisplayLabel';

test.describe('gameModeBannerLabel', () => {
  test('tournament_bracket source maps to TOURNAMENT banner', () => {
    const r = gameModeBannerLabel({
      sourceType: 'tournament_bracket',
      tempo: 'live',
      liveTimeControl: '10+5',
      rated: true,
    });
    expect(r).toContain('TOURNAMENT');
    expect(gameDisplaySourceLabel({ sourceType: 'tournament_bracket' })).toBe('Tournament');
  });

  test('includes rated / unrated suffix', () => {
    const r = gameModeBannerLabel({
      sourceType: 'challenge',
      tempo: 'live',
      liveTimeControl: '5m',
      rated: true,
    });
    expect(r).toMatch(/RATED/);
    const u = gameModeBannerLabel({
      sourceType: 'challenge',
      tempo: 'live',
      liveTimeControl: '5m',
      rated: false,
    });
    expect(u).toMatch(/UNRATED/);
  });
});
