import { test, expect } from '@playwright/test';

import { ROUTES } from '../fixtures/routes';
import { hasTwoUserE2ECredentials } from '../fixtures/env';
import { expectFinishedParitySummary } from '../helpers/finishedGameUi';
import {
  assertFinishedGameAbsentFromFreeActiveLists,
  assertFinishedRecordPageNoLiveTimingUi,
} from '../helpers/historyPreservation';
import { setupAcceptedLiveChallenge } from '../helpers/liveChallengePair';

test.describe('finished game / history integrity', () => {
  test.skip(!hasTwoUserE2ECredentials(), 'Set all four E2E_USER_* and E2E_USER_B_* env vars');
  test.describe.configure({ mode: 'serial', timeout: 150_000 });

  test('finished record preserved on /finished, navigable replay; excluded from /free active UI; no live timing chrome', async ({
    browser,
  }) => {
    const { pageA, pageB, gameId, dispose } = await setupAcceptedLiveChallenge(browser);
    try {
      await expect(pageA).toHaveURL(new RegExp(`/game/${gameId}`), { timeout: 45_000 });
      await expect(pageB.getByTestId('resign-button')).toBeVisible({ timeout: 25_000 });
      await pageB.getByTestId('resign-button').click();

      await expectFinishedParitySummary(pageB, { result: 'black_win', endReason: 'resign' });
      await expectFinishedParitySummary(pageA, { result: 'black_win', endReason: 'resign' }, { bannerTimeoutMs: 45_000 });

      await pageA.goto(ROUTES.finished);
      await expect(pageA.getByTestId('finished-games-root')).toBeVisible({ timeout: 30_000 });

      const card = pageA.getByTestId(`finished-game-card-${gameId}`);
      await expect(card).toBeVisible({ timeout: 30_000 });
      await expect(card).toHaveAttribute('data-game-result', 'black_win');
      await expect(card).toHaveAttribute('data-game-end-reason', 'resign');

      await pageA.getByTestId(`finished-game-open-record-${gameId}`).click();
      await expect(pageA).toHaveURL(new RegExp(`/game/${gameId}`), { timeout: 20_000 });
      await expect(pageA.getByTestId('game-record-readonly')).toBeVisible({ timeout: 25_000 });
      await expect(pageA.getByTestId('finished-result-summary')).toHaveAttribute('data-result', 'black_win');
      await expect(pageA.getByTestId('finished-result-summary')).toHaveAttribute('data-end-reason', 'resign');

      await assertFinishedRecordPageNoLiveTimingUi(pageA);

      await assertFinishedGameAbsentFromFreeActiveLists(pageA, gameId);
    } finally {
      await dispose();
    }
  });
});
