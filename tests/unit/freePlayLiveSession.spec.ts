import { expect, test } from '@playwright/test';

import {
  liveTimeControlTokenIndicatesLivePacing,
  rowIndicatesLiveFreePlayPacing,
} from '../../lib/freePlayLiveSession';
import { isDirectOrPrivateLivePacedMatchRequest } from '../../lib/liveChallengeAcceptGuard';

test.describe('freePlayLiveSession', () => {
  test('live clock token recognized even when tempo mis-stored as daily', () => {
    expect(liveTimeControlTokenIndicatesLivePacing('5m')).toBe(true);
    expect(rowIndicatesLiveFreePlayPacing({ tempo: 'daily', live_time_control: '5m' })).toBe(true);
  });

  test('daily pace (1d/2d/3d) is not live pacing', () => {
    expect(rowIndicatesLiveFreePlayPacing({ tempo: 'daily', live_time_control: '1d' })).toBe(false);
    expect(liveTimeControlTokenIndicatesLivePacing('1d')).toBe(false);
  });

  test('direct open listing excluded from live-paced match helper', () => {
    expect(
      isDirectOrPrivateLivePacedMatchRequest({
        visibility: 'open',
        tempo: 'live',
        live_time_control: '3m',
      })
    ).toBe(false);
  });
});
