import { expect, test } from '@playwright/test';

import {
  isDirectOrPrivateLivePacedMatchRequest,
  LIVE_CHALLENGE_ACCEPT_BLOCKED_MESSAGE,
  shouldBlockAcceptIncomingLiveWhileInLiveGame,
} from '../../lib/liveChallengeAcceptGuard';

test.describe('liveChallengeAcceptGuard', () => {
  test('live incoming + user already in live => block', () => {
    expect(shouldBlockAcceptIncomingLiveWhileInLiveGame('live', true)).toBe(true);
    expect(shouldBlockAcceptIncomingLiveWhileInLiveGame(undefined, true)).toBe(true);
  });

  test('live incoming + user not in live => allow', () => {
    expect(shouldBlockAcceptIncomingLiveWhileInLiveGame('live', false)).toBe(false);
  });

  test('daily incoming + user in live => allow (not this guard)', () => {
    expect(shouldBlockAcceptIncomingLiveWhileInLiveGame('daily', true)).toBe(false);
  });

  test('blocked message constant', () => {
    expect(LIVE_CHALLENGE_ACCEPT_BLOCKED_MESSAGE).toBe(
      'Cannot accept while currently in a live game.'
    );
  });

  test('mis-stored tempo daily + live clock still counts as live-paced direct request', () => {
    expect(
      isDirectOrPrivateLivePacedMatchRequest({
        visibility: 'direct',
        tempo: 'daily',
        live_time_control: '3+2',
      })
    ).toBe(true);
  });
});
