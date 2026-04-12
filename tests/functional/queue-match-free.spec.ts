import { test, expect } from '@playwright/test';

import {
  e2eUserBEmail,
  e2eUserBPassword,
  e2eUserEmail,
  e2eUserPassword,
  hasTwoUserE2ECredentials,
} from '../fixtures/env';
import { ROUTES } from '../fixtures/routes';
import { teardownE2ePairStaleRows } from '../helpers/e2eTeardown';
import { loginAs } from '../helpers/auth';
import {
  gameIdFromUrl,
  waitForGameUrl,
} from '../helpers/gameUrl';
import {
  assertFreeLobbyShowsWaitingSeatNotPrimaryInProgress,
  assertGamePageOpenSeatSolo,
  assertGamePagePairPreFirstMove,
  gotoFreeLobbyGated,
  waitForGameTurnIndicatorSeated,
} from '../helpers/openSeatGameAsserts';

test.describe('free lobby Find Match (open seat / queue)', () => {
  test.skip(!hasTwoUserE2ECredentials(), 'Set all four E2E_USER_* and E2E_USER_B_* env vars');
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  test('A open seat: solo board + lobby list = waiting; B joins → pair pre-move, no clock tick', async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    try {
      await teardownE2ePairStaleRows();
      await loginAs(pageA, e2eUserEmail()!, e2eUserPassword()!);
      await loginAs(pageB, e2eUserBEmail()!, e2eUserBPassword()!);

      await gotoFreeLobbyGated(pageA);
      await pageA.getByTestId('free-find-match').first().click();
      const gameId = await waitForGameUrl(pageA);

      await assertGamePageOpenSeatSolo(pageA);
      await assertFreeLobbyShowsWaitingSeatNotPrimaryInProgress(pageA, gameId);
      await pageA.goto(ROUTES.game(gameId));
      await pageA.waitForLoadState('domcontentloaded');
      await assertGamePageOpenSeatSolo(pageA);

      await gotoFreeLobbyGated(pageB);
      await pageB.getByTestId('free-find-match').first().click();
      await pageB.waitForURL((u) => u.pathname === `/game/${gameId}`, { timeout: 60_000 });
      await pageB.waitForLoadState('domcontentloaded');
      expect(gameIdFromUrl(pageB.url())).toBe(gameId);

      await waitForGameTurnIndicatorSeated(pageA);
      await expect(pageA.getByTestId('digital-chess-clock')).toBeVisible({ timeout: 15_000 });
      await assertGamePagePairPreFirstMove(pageA);
      await assertGamePagePairPreFirstMove(pageB);
    } finally {
      await teardownE2ePairStaleRows();
      await contextA.close();
      await contextB.close();
    }
  });

  test('A creates open seat and leaves waiting seat before B joins — lobby row cleared, not primary in-progress', async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();
    try {
      await teardownE2ePairStaleRows();
      await loginAs(pageA, e2eUserEmail()!, e2eUserPassword()!);

      await gotoFreeLobbyGated(pageA);
      await pageA.getByTestId('free-find-match').first().click();
      const gameId = await waitForGameUrl(pageA);

      await assertGamePageOpenSeatSolo(pageA);
      await assertFreeLobbyShowsWaitingSeatNotPrimaryInProgress(pageA, gameId);

      await pageA.getByTestId('game-abandon-open-seat').click();
      await expect(pageA.getByTestId('game-row-status')).toContainText(/finished/i, { timeout: 25_000 });

      await gotoFreeLobbyGated(pageA);
      await expect(pageA.getByTestId('free-primary-game')).toHaveCount(0);
      await expect(pageA.getByTestId(`free-active-game-row-${gameId}`)).toHaveCount(0);
      await expect(pageA.locator(`[data-active-game-id="${gameId}"]`)).toHaveCount(0);
    } finally {
      await teardownE2ePairStaleRows();
      await contextA.close();
    }
  });

  test('B joins then closes before move one — A stays in valid seated pre-move state', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    try {
      await teardownE2ePairStaleRows();
      await loginAs(pageA, e2eUserEmail()!, e2eUserPassword()!);
      await loginAs(pageB, e2eUserBEmail()!, e2eUserBPassword()!);

      await gotoFreeLobbyGated(pageA);
      await pageA.getByTestId('free-find-match').first().click();
      const gameId = await waitForGameUrl(pageA);
      await assertGamePageOpenSeatSolo(pageA);

      await gotoFreeLobbyGated(pageB);
      await pageB.getByTestId('free-find-match').first().click();
      await pageB.waitForURL((u) => u.pathname === `/game/${gameId}`, { timeout: 60_000 });
      await pageB.waitForLoadState('domcontentloaded');

      await waitForGameTurnIndicatorSeated(pageA);
      await waitForGameTurnIndicatorSeated(pageB);
      await assertGamePagePairPreFirstMove(pageB);

      await pageB.goto('about:blank');

      await expect(pageA.getByTestId('game-turn-indicator')).toHaveAttribute('data-game-state', 'seated', {
        timeout: 15_000,
      });
      await expect(pageA.getByTestId('game-row-status')).toContainText(/active/i);
      await assertGamePagePairPreFirstMove(pageA);
      await expect(pageA.getByTestId('game-turn-indicator')).not.toHaveAttribute('data-game-state', 'waiting');
    } finally {
      await teardownE2ePairStaleRows();
      await contextA.close();
      await contextB.close();
    }
  });

  test('A opens seat, B joins, both land in same game', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    try {
      await teardownE2ePairStaleRows();
      await loginAs(pageA, e2eUserEmail()!, e2eUserPassword()!);
      await loginAs(pageB, e2eUserBEmail()!, e2eUserBPassword()!);

      await gotoFreeLobbyGated(pageA);
      await gotoFreeLobbyGated(pageB);

      await pageA.getByTestId('free-find-match').first().click();
      await pageA.waitForURL((u) => u.pathname.startsWith('/game/'), { timeout: 45_000 });
      const idA = gameIdFromUrl(pageA.url());

      await pageB.getByTestId('free-find-match').first().click();
      await pageB.waitForURL((u) => u.pathname.startsWith('/game/'), { timeout: 45_000 });
      const idB = gameIdFromUrl(pageB.url());

      expect(idB).toBe(idA);
    } finally {
      await teardownE2ePairStaleRows();
      await contextA.close();
      await contextB.close();
    }
  });
});
