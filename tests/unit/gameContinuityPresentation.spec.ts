import { expect, test } from '@playwright/test';

import {
  continuityRowActionLabel,
  freeActiveGamesHref,
  isDailyAsyncContinuityGame,
  isLiveContinuityGame,
  partitionGamesByContinuity,
} from '@/lib/gameContinuityPresentation';

test.describe('gameContinuityPresentation', () => {
  test('partitions live vs daily/async rows', () => {
    const live = {
      id: '1',
      status: 'active',
      tempo: 'live',
      live_time_control: '3+2',
      white_player_id: 'a',
      black_player_id: 'b',
    };
    const daily = {
      id: '2',
      status: 'active',
      tempo: 'daily',
      live_time_control: '1d',
      white_player_id: 'a',
      black_player_id: 'b',
    };
    const parts = partitionGamesByContinuity([live, daily]);
    expect(parts.live).toHaveLength(1);
    expect(parts.dailyAsync).toHaveLength(1);
    expect(isLiveContinuityGame(live)).toBe(true);
    expect(isDailyAsyncContinuityGame(daily)).toBe(true);
  });

  test('hash hrefs for /free/active sections', () => {
    expect(freeActiveGamesHref('live')).toBe('/free/active#live');
    expect(freeActiveGamesHref('async')).toBe('/free/active#async');
  });

  test('live row actions emphasize reconnect not indefinite resume', () => {
    const seated = continuityRowActionLabel({
      tempo: 'live',
      live_time_control: '5+0',
      black_player_id: 'b',
    });
    expect(seated).toBe('Return to board');
    expect(seated.toLowerCase()).not.toContain('resume');
  });

  test('daily row actions use resume wording', () => {
    expect(
      continuityRowActionLabel({
        tempo: 'daily',
        live_time_control: '1d',
        black_player_id: 'b',
      }),
    ).toBe('Resume daily game');
  });
});
