import type { Browser, Page } from '@playwright/test';

import {
  e2eUserBEmail,
  e2eUserBPassword,
  e2eUserEmail,
  e2eUserPassword,
} from '../fixtures/env';
import { ROUTES } from '../fixtures/routes';
import { loginAs } from './auth';
import { teardownE2ePairStaleRows } from './e2eTeardown';
import { gameIdFromUrl } from './gameUrl';
import {
  assertGamePagePairPreFirstMove,
  gotoFreeLobbyGated,
  waitForGameTurnIndicatorSeated,
} from './openSeatGameAsserts';

/**
 * Both players seated via `/free` Find Match on an open seat (not direct challenge).
 */
export async function setupPairedGameViaFreeFindMatch(browser: Browser): Promise<{
  pageA: Page;
  pageB: Page;
  gameId: string;
  dispose: () => Promise<void>;
}> {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const dispose = async () => {
    try {
      await teardownE2ePairStaleRows();
      await contextA.close().catch(() => {});
      await contextB.close().catch(() => {});
    } catch {
      /* best-effort */
    }
  };

  await teardownE2ePairStaleRows();
  await loginAs(pageA, e2eUserEmail()!, e2eUserPassword()!);
  await loginAs(pageB, e2eUserBEmail()!, e2eUserBPassword()!);

  await gotoFreeLobbyGated(pageA);
  await pageA.getByTestId('free-find-match').first().click();
  await pageA.waitForURL((u) => u.pathname.startsWith('/game/'), { timeout: 60_000 });
  await pageA.waitForLoadState('domcontentloaded');
  const gameId = gameIdFromUrl(pageA.url());

  await gotoFreeLobbyGated(pageB);
  await pageB.getByTestId('free-find-match').first().click();
  await pageB.waitForURL((u) => u.pathname === `/game/${gameId}`, { timeout: 60_000 });
  await pageB.waitForLoadState('domcontentloaded');

  await waitForGameTurnIndicatorSeated(pageA);
  await waitForGameTurnIndicatorSeated(pageB);
  await assertGamePagePairPreFirstMove(pageA);
  await assertGamePagePairPreFirstMove(pageB);

  return { pageA, pageB, gameId, dispose };
}

/** Ensure both pages still routed to the paired game (optional guard before board ops). */
export async function expectBothOnGame(pageA: Page, pageB: Page, gameId: string): Promise<void> {
  if (!pageA.url().includes(`/game/${gameId}`)) {
    await pageA.goto(ROUTES.game(gameId));
    await pageA.waitForLoadState('domcontentloaded');
  }
  if (!pageB.url().includes(`/game/${gameId}`)) {
    await pageB.goto(ROUTES.game(gameId));
    await pageB.waitForLoadState('domcontentloaded');
  }
}
