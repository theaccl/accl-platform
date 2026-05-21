import type { Browser, Page } from '@playwright/test';

import type { E2EPairCredentials } from './liveChallengePair';
import { loginAs } from './auth';
import { teardownE2ePairStaleRows } from './e2eTeardown';
import { gameIdFromUrl } from './gameUrl';
import { waitForGameUrl } from './gameUrl';

const FIND_MATCH_ENTRY = '/free/lobby/blitz';

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
      await teardownE2ePairStaleRows();
      await contextA.close().catch(() => {});
      await contextB.close().catch(() => {});
    } catch {
      await contextA.close().catch(() => {});
      await contextB.close().catch(() => {});
    }
  };

  await loginAs(pageA, pair.aEmail, pair.aPassword);
  await loginAs(pageB, pair.bEmail, pair.bPassword);

  await pageA.goto(FIND_MATCH_ENTRY);
  await pageA.getByTestId('free-lobby-mode-room-blitz').waitFor({ state: 'visible', timeout: 30_000 });
  await pageA.getByTestId('free-find-match').first().click();
  const gameId = await waitForGameUrl(pageA);

  await pageB.goto(FIND_MATCH_ENTRY);
  await pageB.getByTestId('free-lobby-mode-room-blitz').waitFor({ state: 'visible', timeout: 30_000 });
  await pageB.getByTestId('free-find-match').first().click();
  await pageB.waitForURL((u) => u.pathname === `/game/${gameId}`, { timeout: 90_000 });

  await pageA.goto(`/game/${gameId}`);
  await pageA.waitForLoadState('domcontentloaded');

  return { pageA, pageB, gameId, dispose };
}
