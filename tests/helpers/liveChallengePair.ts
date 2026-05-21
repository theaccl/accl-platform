import type { Browser, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { e2eUserBEmail, e2eUserBPassword, e2eUserEmail, e2eUserPassword } from '../fixtures/env';
import { ROUTES } from '../fixtures/routes';
import { loginAs } from './auth';
import { teardownE2ePairStaleRows } from './e2eTeardown';
import { gameIdFromUrl } from './gameUrl';
import { openMatchRequestsInbox } from './requestsInbox';

/**
 * Architecture note: accepted direct challenges create a `games` row with **both** seats filled.
 * There is no stable half-seated **challenge** game for “A moves before B joins.” True no-solo-start /
 * open-seat gating lives under queue / open-seat flows — see `tests/regression/no-solo-start.spec.ts`
 * (and home Find Match). This helper’s consumers use “not waiting for opponent” + timing only as a
 * **proxy** that both players are seated for this flow.
 */

/**
 * Sends a live 5m / White direct challenge from `/free` and waits for awaiting-response UI.
 * Does not accept — use for “no game until accept” coverage.
 */
const CHALLENGE_ENTRY = '/free/play';

export async function sendPendingLiveChallengeFromFree(
  page: Page,
  opponentEmail?: string,
): Promise<void> {
  await page.goto(CHALLENGE_ENTRY);
  await expect(page.getByTestId('direct-challenge-panel')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('direct-challenge-clock-5m').click();
  await page.getByLabel(/Your color/i).selectOption('white');
  await page.getByTestId('challenge-opponent-lookup').fill(opponentEmail ?? e2eUserBEmail()!);
  await page.getByTestId('challenge-find-opponent').click();
  await expect(page.locator('[data-testid^="user-row-"]')).toBeVisible({ timeout: 25_000 });
  await page.getByTestId('challenge-send-submit').click();
  await expect(page.getByTestId('challenge-sent-awaiting')).toBeVisible({ timeout: 20_000 });
}

/**
 * Two isolated storage contexts (no shared cookies/storage). A sends live 5 min White → B;
 * B accepts on `/requests`. Waits for realtime-driven navigation on A before returning.
 */
export type E2EPairCredentials = {
  aEmail: string;
  aPassword: string;
  bEmail: string;
  bPassword: string;
};

export async function setupAcceptedLiveChallenge(
  browser: Browser,
  pair?: E2EPairCredentials,
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

  const aMail = pair?.aEmail ?? e2eUserEmail()!;
  const aPass = pair?.aPassword ?? e2eUserPassword()!;
  const bMail = pair?.bEmail ?? e2eUserBEmail()!;
  const bPass = pair?.bPassword ?? e2eUserBPassword()!;

  await loginAs(pageA, aMail, aPass);
  await loginAs(pageB, bMail, bPass);

  await pageA.goto(CHALLENGE_ENTRY);
  await expect(pageA.getByTestId('direct-challenge-panel')).toBeVisible({ timeout: 30_000 });
  await pageA.getByTestId('direct-challenge-clock-5m').click();
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

  try {
    await pageA.waitForURL((u) => u.pathname === `/game/${gameId}`, { timeout: 45_000 });
  } catch {
    await pageA.goto(ROUTES.game(gameId));
  }
  await pageA.waitForLoadState('domcontentloaded');
  await expect(pageB.getByTestId('game-startup-snapshot')).toBeAttached({ timeout: 30_000 });
  await expect(pageA.getByTestId('game-startup-snapshot')).toBeAttached({ timeout: 30_000 });

  return { pageA, pageB, gameId, dispose };
}
