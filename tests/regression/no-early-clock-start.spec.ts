import { test, expect } from '@playwright/test';

import { hasTwoUserE2ECredentials } from '../fixtures/env';
import { readLiveClockTexts } from '../helpers/clock';
import { setupAcceptedLiveChallenge } from '../helpers/liveChallengePair';

test.describe('no early live clock run before first move', () => {
  test.skip(!hasTwoUserE2ECredentials(), 'Set all four E2E_USER_* and E2E_USER_B_* env vars');
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  /**
   * Live clocks render once both players exist, but `last_move_at` is null after challenge accept
   * (`preStartGameTimingFields`). Elapsed time is 0 — displayed side times should not count down yet.
   */
  test('live clock digits unchanged over 2.5s before any move', async ({ browser }) => {
    const { pageA, pageB, gameId, dispose } = await setupAcceptedLiveChallenge(browser);
    try {
      await expect(pageA).toHaveURL(new RegExp(`/game/${gameId}`), { timeout: 45_000 });
      await expect(pageA.getByTestId('digital-chess-clock')).toBeVisible({ timeout: 25_000 });
      await expect(pageB.getByTestId('digital-chess-clock')).toBeVisible({ timeout: 25_000 });
      await expect(pageA.getByTestId('digital-chess-clock')).toHaveAttribute('data-clock-ticking', 'false');
      await expect(pageB.getByTestId('digital-chess-clock')).toHaveAttribute('data-clock-ticking', 'false');

      const a1 = await readLiveClockTexts(pageA);
      await new Promise((r) => setTimeout(r, 2500));
      const a2 = await readLiveClockTexts(pageA);
      expect(a2.white).toBe(a1.white);
      expect(a2.black).toBe(a1.black);

      const b1 = await readLiveClockTexts(pageB);
      await new Promise((r) => setTimeout(r, 2500));
      const b2 = await readLiveClockTexts(pageB);
      expect(b2.white).toBe(b1.white);
      expect(b2.black).toBe(b1.black);
    } finally {
      await dispose();
    }
  });
});
