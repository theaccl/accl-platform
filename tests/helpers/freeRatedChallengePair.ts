import type { Browser, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { e2eUserBEmail, e2eUserBPassword, e2eUserEmail, e2eUserPassword } from '../fixtures/env';
import { ROUTES } from '../fixtures/routes';
import { loginAs } from './auth';
import { teardownE2ePairStaleRows } from './e2eTeardown';
import { gameIdFromUrl } from './gameUrl';
import { openMatchRequestsInbox } from './requestsInbox';

export type FreeDirectChallengeOptions = {
  rated: boolean;
  tempo?: 'live' | 'daily' | 'correspondence';
};

/**
 * Same pairing contract as `setupAcceptedLiveChallenge`, but drives `/free` direct-challenge rated/unrated + tempo
 * before send (no tournament / open-seat paths).
 */
export async function setupAcceptedFreeDirectChallenge(
  browser: Browser,
  options: FreeDirectChallengeOptions
): Promise<{
  pageA: Page;
  pageB: Page;
  gameId: string;
  dispose: () => Promise<void>;
}> {
  const contextA = await browser.newContext({ javaScriptEnabled: true });
  const contextB = await browser.newContext({ javaScriptEnabled: true });
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  const dispose = async () => {
    try {
      await teardownE2ePairStaleRows();
      for (const p of [pageA, pageB]) {
        try {
          await p.evaluate(() => {
            try {
              localStorage.clear();
              sessionStorage.clear();
            } catch {
              /* ignore */
            }
          });
        } catch {
          /* ignore */
        }
      }
      await contextA.clearCookies();
      await contextB.clearCookies();
    } finally {
      await contextA.close().catch(() => {});
      await contextB.close().catch(() => {});
    }
  };

  const aMail = e2eUserEmail()!;
  const aPass = e2eUserPassword()!;
  const bMail = e2eUserBEmail()!;
  const bPass = e2eUserBPassword()!;

  await teardownE2ePairStaleRows();
  await loginAs(pageA, aMail, aPass);
  await loginAs(pageB, bMail, bPass);

  await pageA.goto(ROUTES.free);
  await expect(pageA.getByTestId('free-lobby-root')).toBeVisible({ timeout: 30_000 });
  await expect(pageA.getByTestId('free-lobby-ready')).toBeAttached({ timeout: 30_000 });

  const tempo = options.tempo ?? 'live';
  await pageA.locator('#direct-challenge-free-tempo').selectOption(tempo);

  if (tempo === 'live') {
    await pageA.getByRole('button', { name: '5 min' }).click();
  } else if (tempo === 'daily') {
    await pageA.getByRole('button', { name: '30 min' }).click();
  }
  /* correspondence: default 1d chip is pre-selected in panel state */

  if (options.rated) {
    await pageA.getByTestId('direct-challenge-free-match-rated').check();
  } else {
    await pageA.getByTestId('direct-challenge-free-match-unrated').check();
  }

  await pageA.getByLabel(/Your color/i).selectOption('white');
  await pageA.getByTestId('challenge-opponent-lookup').fill(bMail);
  await pageA.getByTestId('challenge-find-opponent').click();
  await expect(pageA.locator('[data-testid^="user-row-"]')).toBeVisible({ timeout: 25_000 });
  await pageA.getByTestId('challenge-send-submit').click();
  await expect(pageA.getByText(/Challenge sent/i)).toBeVisible({ timeout: 20_000 });

  await openMatchRequestsInbox(pageB);
  const accept = pageB.locator('[data-testid^="challenge-accept-"]').first();
  await expect(accept).toBeVisible({ timeout: 60_000 });
  await accept.click();
  await pageB.waitForURL((u) => u.pathname.startsWith('/game/'), { timeout: 60_000 });
  await pageB.waitForLoadState('domcontentloaded');
  const gameId = gameIdFromUrl(pageB.url());

  await pageA.waitForURL((u) => u.pathname === `/game/${gameId}`, { timeout: 90_000 });
  await pageA.waitForLoadState('domcontentloaded');
  await expect(pageB.getByTestId('game-startup-snapshot')).toBeAttached({ timeout: 30_000 });
  await expect(pageA.getByTestId('game-startup-snapshot')).toBeAttached({ timeout: 30_000 });

  return { pageA, pageB, gameId, dispose };
}
