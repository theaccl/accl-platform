import { expect, test } from '@playwright/test';

import {
  liveTimeControlTokenIndicatesLivePacing,
  rowIndicatesLiveFreePlayPacing,
} from '../../lib/freePlayLiveSession';
import { isDirectOrPrivateLivePacedMatchRequest } from '../../lib/liveChallengeAcceptGuard';

test.describe('freePlayLiveSession', () => {
  test('live tempo is recognized with normalized trim/lowercase', () => {
    expect(liveTimeControlTokenIndicatesLivePacing('5m')).toBe(true);
    expect(rowIndicatesLiveFreePlayPacing({ tempo: ' LIVE ', live_time_control: '5m' })).toBe(true);
  });

  test('async tempo is not live pacing even with live-looking clock tokens', () => {
    expect(rowIndicatesLiveFreePlayPacing({ tempo: 'daily', live_time_control: '1d' })).toBe(false);
    expect(rowIndicatesLiveFreePlayPacing({ tempo: ' DAILY ', live_time_control: '5m' })).toBe(false);
    expect(rowIndicatesLiveFreePlayPacing({ tempo: ' correspondence ', live_time_control: '3+2' })).toBe(false);
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
