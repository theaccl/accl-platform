import { test, expect } from '@playwright/test';

import { hasTwoUserE2ECredentials } from '../fixtures/env';
import { playOpeningE2E4 } from '../helpers/board';
import { readLiveClockTexts } from '../helpers/clock';
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

      let releaseSubmit = () => {};
      let markSubmitReady = () => {};
      const submitReady = new Promise<void>((resolve) => {
        markSubmitReady = resolve;
      });
      const holdSubmit = new Promise<void>((resolve) => {
        releaseSubmit = resolve;
      });
      await pageA.route('**/api/game/submit-move', async (route) => {
        const response = await route.fetch();
        markSubmitReady();
        await holdSubmit;
        await route.fulfill({ response });
      });

      try {
        await playOpeningE2E4(pageA);
        await submitReady;

        await expect(pageA.getByTestId('digital-chess-clock')).toHaveAttribute('data-clock-ticking', 'true', {
          timeout: 1_000,
        });
        const pendingClock = await readLiveClockTexts(pageA);
        await expect
          .poll(async () => (await readLiveClockTexts(pageA)).black, { timeout: 2_500 })
          .not.toBe(pendingClock.black);
      } finally {
        releaseSubmit();
        await pageA.unroute('**/api/game/submit-move');
      }

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
