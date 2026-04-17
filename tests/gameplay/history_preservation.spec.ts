import { test, expect } from '@playwright/test';

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

  test('finished record preserved after game end, navigable replay; excluded from /free active UI; no live timing chrome', async ({
    browser,
  }) => {
    const { pageA, pageB, gameId, dispose } = await setupAcceptedLiveChallenge(browser);
    try {
      await expect(pageA).toHaveURL(new RegExp(`/game/${gameId}`), { timeout: 45_000 });
      await expect(pageB.getByTestId('resign-button')).toBeVisible({ timeout: 25_000 });
      await pageB.getByTestId('resign-button').click();

      await expectFinishedParitySummary(pageB, { result: 'black_win', endReason: 'resign' });
      await expectFinishedParitySummary(pageA, { result: 'black_win', endReason: 'resign' }, { bannerTimeoutMs: 45_000 });

      await pageA.goto(`/game/${gameId}`);
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
