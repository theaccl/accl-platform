import { test, expect } from '@playwright/test';

import { hasTwoUserE2ECredentials } from '../fixtures/env';
import { ROUTES } from '../fixtures/routes';
import { gameIdFromUrl } from '../helpers/gameUrl';
import { setupAcceptedLiveChallenge } from '../helpers/liveChallengePair';

/**
 * Rematch uses `match_requests` with `request_type: 'rematch'` (same accept path as direct challenge).
 * Requester must subscribe for UPDATE like DirectChallengePanel so both players reach the new game.
 */
test.describe('rematch accept — launch convergence', () => {
  test.skip(!hasTwoUserE2ECredentials(), 'Set all four E2E_USER_* and E2E_USER_B_* env vars');
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test('finished game: requester sends rematch, opponent accepts; both on same new /game/:id', async ({
    browser,
  }) => {
    const { pageA, pageB, gameId: finishedGameId, dispose } = await setupAcceptedLiveChallenge(browser);
    try {
      await expect(pageA).toHaveURL(new RegExp(`/game/${finishedGameId}`), { timeout: 45_000 });

      await pageB.getByTestId('resign-button').click();
      await expect(pageB.getByTestId('game-row-status')).toContainText('finished', { timeout: 25_000 });
      await expect(pageA.getByTestId('game-row-status')).toContainText('finished', { timeout: 45_000 });

      await pageA.getByTestId('rematch-request-button').click();
      await expect(pageA.getByText(/Rematch request sent/i)).toBeVisible({ timeout: 20_000 });

      await pageB.goto(ROUTES.requests);
      await expect(pageB.getByTestId('requests-inbox-root')).toBeVisible({ timeout: 15_000 });
      const accept = pageB.locator('[data-testid^="challenge-accept-"]').first();
      await expect(accept).toBeVisible({ timeout: 45_000 });
      await accept.click();
      await pageB.waitForURL((u) => u.pathname.startsWith('/game/'), { timeout: 45_000 });
      const newGameId = gameIdFromUrl(pageB.url());
      expect(newGameId).not.toBe(finishedGameId);

      await expect(pageA).toHaveURL(new RegExp(`/game/${newGameId}`), { timeout: 45_000 });
      expect(gameIdFromUrl(pageA.url())).toBe(newGameId);
    } finally {
      await dispose();
    }
  });
});
