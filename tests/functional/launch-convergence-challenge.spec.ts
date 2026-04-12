import { test, expect } from '@playwright/test';

import { hasTwoUserE2ECredentials } from '../fixtures/env';
import { gameIdFromUrl } from '../helpers/gameUrl';
import { setupAcceptedLiveChallenge } from '../helpers/liveChallengePair';

/**
 * After Phase 4: challenger subscribes to `match_requests` UPDATE and `router.push` when accepted.
 * Both players should reach `/game/:id` without manual URL copy.
 */
test.describe('launch convergence — direct challenge', () => {
  test.skip(!hasTwoUserE2ECredentials(), 'Set all four E2E_USER_* and E2E_USER_B_* env vars');
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test('challenger and accepter both auto-navigate to the same game', async ({ browser }) => {
    const { pageA, pageB, gameId, dispose } = await setupAcceptedLiveChallenge(browser);
    try {
      await expect(pageB).toHaveURL(new RegExp(`/game/${gameId}`), { timeout: 45_000 });
      await expect(pageA).toHaveURL(new RegExp(`/game/${gameId}`), { timeout: 45_000 });
      expect(gameIdFromUrl(pageA.url())).toBe(gameId);
      expect(gameIdFromUrl(pageB.url())).toBe(gameId);
      await expect(pageA.getByTestId('game-row-id')).toContainText(gameId.slice(0, 8), {
        timeout: 20_000,
      });
    } finally {
      await dispose();
    }
  });
});
