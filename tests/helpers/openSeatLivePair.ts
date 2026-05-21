import type { Browser, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import type { E2EPairCredentials } from './liveChallengePair';
import { loginAs } from './auth';
import { teardownE2ePairStaleRows } from './e2eTeardown';
import { waitForGameUrl } from './gameUrl';

/** Find Match + open-seat panel live on mode room (not hub `/free`). */
const BLITZ_MODE_ROOM = '/free/lobby/blitz';

async function gotoBlitzFindMatch(page: Page): Promise<void> {
  await page.goto(BLITZ_MODE_ROOM);
  await expect(page.getByTestId('free-lobby-mode-room-blitz')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('free-find-match').first()).toBeVisible({ timeout: 30_000 });
}

/** Live open-seat pairing (Find Match) — reliable for Stage 0 overlap setup. */
export async function setupLiveOpenSeatPair(
  browser: Browser,
  pair: E2EPairCredentials,
): Promise<{ pageA: Page; pageB: Page; gameId: string; dispose: () => Promise<void> }> {
  const contextA = await browser.newContext({ javaScriptEnabled: true });
  const contextB = await browser.newContext({ javaScriptEnabled: true });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const dispose = async () => {
    try {
      await teardownE2ePairStaleRows({ aEmail: pair.aEmail, bEmail: pair.bEmail });
      await contextA.close().catch(() => {});
      await contextB.close().catch(() => {});
    } catch {
      await contextA.close().catch(() => {});
      await contextB.close().catch(() => {});
    }
  };

  await teardownE2ePairStaleRows({ aEmail: pair.aEmail, bEmail: pair.bEmail });
  await loginAs(pageA, pair.aEmail, pair.aPassword);
  await loginAs(pageB, pair.bEmail, pair.bPassword);

  await gotoBlitzFindMatch(pageA);
  await pageA.getByTestId('free-create-game').first().click();
  const gameId = await waitForGameUrl(pageA, 90_000);

  await gotoBlitzFindMatch(pageB);
  await pageB.getByTestId('free-find-match').first().click();
  await pageB.waitForURL((u) => u.pathname === `/game/${gameId}`, { timeout: 90_000 });

  await pageA.goto(`/game/${gameId}`);
  await pageA.waitForLoadState('domcontentloaded');

  return { pageA, pageB, gameId, dispose };
}
