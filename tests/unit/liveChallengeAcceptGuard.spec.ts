import { expect, test } from '@playwright/test';

import {
  isDirectOrPrivateLivePacedMatchRequest,
  LIVE_CHALLENGE_ACCEPT_BLOCKED_MESSAGE,
  shouldBlockAcceptIncomingLiveWhileInLiveGame,
} from '../../lib/liveChallengeAcceptGuard';

test.describe('liveChallengeAcceptGuard', () => {
  test('same slot conflict => block', () => {
    expect(shouldBlockAcceptIncomingLiveWhileInLiveGame(true)).toBe(true);
  });

  test('no same-slot conflict => allow', () => {
    expect(shouldBlockAcceptIncomingLiveWhileInLiveGame(false)).toBe(false);
  });

  test('blocked message constant', () => {
    expect(LIVE_CHALLENGE_ACCEPT_BLOCKED_MESSAGE).toBe(
      'Cannot accept while currently in a live game.'
    );
  });

  test('daily direct request with live-looking clock is async, not live-blocked', () => {
    expect(
      isDirectOrPrivateLivePacedMatchRequest({
        visibility: 'direct',
        tempo: ' daily ',
        live_time_control: '3+2',
      })
    ).toBe(false);
  });
});
