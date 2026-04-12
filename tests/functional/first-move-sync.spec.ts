import { test, expect } from '@playwright/test';

import { hasTwoUserE2ECredentials } from '../fixtures/env';
import { playOpeningE2E4 } from '../helpers/board';
import { setupAcceptedLiveChallenge } from '../helpers/liveChallengePair';

test.describe('first move sync (two users)', () => {
  test.skip(!hasTwoUserE2ECredentials(), 'Set all four E2E_USER_* and E2E_USER_B_* env vars');
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  test('after shared live challenge game, white e2-e4 appears for black as their turn', async ({
    browser,
  }) => {
    const { pageA, pageB, gameId, dispose } = await setupAcceptedLiveChallenge(browser);
    try {
      await expect(pageA).toHaveURL(new RegExp(`/game/${gameId}`), { timeout: 45_000 });
      await expect(pageA.getByTestId('game-board')).toBeVisible({ timeout: 20_000 });
      await expect(pageA.getByTestId('game-turn-indicator')).toContainText('YOUR TURN', {
        timeout: 25_000,
      });

      await playOpeningE2E4(pageA);

      await expect(pageA.getByTestId('digital-chess-clock')).toHaveAttribute('data-clock-ticking', 'true', {
        timeout: 15_000,
      });
      await expect(pageB.getByTestId('digital-chess-clock')).toHaveAttribute('data-clock-ticking', 'true', {
        timeout: 15_000,
      });

      await expect(pageA.getByTestId('game-turn-indicator')).toContainText("OPPONENT'S TURN", {
        timeout: 30_000,
      });
      await expect(pageB.getByTestId('game-turn-indicator')).toContainText('YOUR TURN', {
        timeout: 30_000,
      });
    } finally {
      await dispose();
    }
  });
});
