import { test, expect } from '@playwright/test';

import { e2eUserBEmail, e2eUserBPassword, e2eUserEmail, e2eUserPassword, hasTwoUserE2ECredentials } from '../fixtures/env';
import { ROUTES } from '../fixtures/routes';
import { loginAs } from '../helpers/auth';
import { expectNoGhostReadyBanner } from '../helpers/freePlayAsserts';
import { setupAcceptedLiveChallenge, sendPendingLiveChallengeFromFree } from '../helpers/liveChallengePair';
import { openMatchRequestsInbox } from '../helpers/requestsInbox';
import { teardownE2ePairStaleRows } from '../helpers/e2eTeardown';

/**
 * Direct challenge does not produce a durable half-seated **challenge** game: acceptance inserts
 * both seats. True **solo-start / open-seat** prevention (no moves until Black joins) is owned by
 * `tests/regression/no-solo-start.spec.ts`. Additional queue-flow coverage may live in
 * `tests/functional/queue-match-free.spec.ts` when extended. This file asserts only the direct-challenge
 * accept path: both seated, pre-move timing, and clock tick gating.
 */
test.describe('direct challenge (two users)', () => {
  test.skip(!hasTwoUserE2ECredentials(), 'Set E2E_USER_EMAIL, E2E_USER_PASSWORD, E2E_USER_B_EMAIL, E2E_USER_B_PASSWORD');
  test.describe.configure({ mode: 'serial', timeout: 180_000 });

  test('A sends live challenge, B accepts on /requests, both reach same /game/:id', async ({
    browser,
  }) => {
    const { pageA, pageB, gameId, dispose } = await setupAcceptedLiveChallenge(browser);
    try {
      await expect(pageA).toHaveURL(new RegExp(`/game/${gameId}`), { timeout: 95_000 });
      await expect(pageB).toHaveURL(new RegExp(`/game/${gameId}`));
      await expect(pageA.getByTestId('game-row-id')).toContainText(gameId, { timeout: 25_000 });
      await expect(pageB.getByTestId('game-row-id')).toContainText(gameId, { timeout: 25_000 });

      const snapA = pageA.getByTestId('game-startup-snapshot');
      const snapB = pageB.getByTestId('game-startup-snapshot');
      await expect(snapA).toBeAttached();
      await expect(snapB).toBeAttached();
      const emptyTiming = (v: string | null) => (v ?? '').trim() === '';
      expect(emptyTiming(await snapA.getAttribute('data-last-move-at'))).toBe(true);
      expect(emptyTiming(await snapA.getAttribute('data-move-deadline-at'))).toBe(true);
      expect(emptyTiming(await snapB.getAttribute('data-last-move-at'))).toBe(true);
      expect(emptyTiming(await snapB.getAttribute('data-move-deadline-at'))).toBe(true);

      await expect(pageA.getByTestId('digital-chess-clock')).toBeVisible({ timeout: 15_000 });
      await expect(pageB.getByTestId('digital-chess-clock')).toBeVisible({ timeout: 15_000 });
      await expect(pageA.getByTestId('digital-chess-clock')).toHaveAttribute('data-clock-ticking', 'false');
      await expect(pageB.getByTestId('digital-chess-clock')).toHaveAttribute('data-clock-ticking', 'false');

      await expect(pageA.getByTestId('game-turn-indicator')).not.toContainText('Waiting for an opponent', {
        timeout: 15_000,
      });
      await expect(pageB.getByTestId('game-turn-indicator')).not.toContainText('Waiting for an opponent');

      await expect(pageA.getByText(/Live 5M/i)).toBeVisible({ timeout: 20_000 });
      await expect(pageB.getByText(/Live 5M/i)).toBeVisible({ timeout: 20_000 });
    } finally {
      await dispose();
    }
  });

  test('after accept, /free shows primary table on refresh; game URL survives reload', async ({
    browser,
  }) => {
    const { pageA, pageB, gameId, dispose } = await setupAcceptedLiveChallenge(browser);
    try {
      await pageA.goto(ROUTES.free);
      await pageA.reload();
      await expectNoGhostReadyBanner(pageA);
      await expect(pageA.getByTestId('free-primary-game')).toBeVisible({ timeout: 25_000 });
      await expect(pageA.getByTestId('free-primary-game')).toContainText(gameId.slice(0, 8));

      await pageB.goto(ROUTES.free);
      await pageB.reload();
      await expectNoGhostReadyBanner(pageB);
      await expect(pageB.getByTestId('free-primary-game')).toBeVisible({ timeout: 25_000 });

      await pageA.goto(ROUTES.game(gameId));
      await pageA.reload();
      await expect(pageA).toHaveURL(new RegExp(`/game/${gameId}`));
    } finally {
      await dispose();
    }
  });

  test('B declines incoming challenge before accept (no shared game)', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    try {
      await loginAs(pageA, e2eUserEmail()!, e2eUserPassword()!);
      await loginAs(pageB, e2eUserBEmail()!, e2eUserBPassword()!);
      await sendPendingLiveChallengeFromFree(pageA);
      await openMatchRequestsInbox(pageB);
      const decline = pageB.locator('[data-testid^="challenge-decline-"]').first();
      await expect(decline).toBeVisible({ timeout: 60_000 });
      await decline.click();
      await expect(pageB.locator('[data-testid^="incoming-request-card-"]')).toHaveCount(0, {
        timeout: 20_000,
      });
    } finally {
      await teardownE2ePairStaleRows();
      await contextA.close();
      await contextB.close();
    }
  });

  test('A cancels outgoing challenge before B accepts', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    try {
      await loginAs(pageA, e2eUserEmail()!, e2eUserPassword()!);
      await loginAs(pageB, e2eUserBEmail()!, e2eUserBPassword()!);
      await sendPendingLiveChallengeFromFree(pageA);
      await pageA.goto(ROUTES.free);
      await expect(pageA.getByTestId('free-lobby-root')).toBeVisible({ timeout: 20_000 });
      const cancelBtn = pageA.getByRole('button', { name: 'Cancel' }).first();
      await expect(cancelBtn).toBeVisible({ timeout: 25_000 });
      await cancelBtn.click();
      await openMatchRequestsInbox(pageB);
      await expect(pageB.locator('[data-testid^="incoming-request-card-"]')).toHaveCount(0, {
        timeout: 25_000,
      });
    } finally {
      await teardownE2ePairStaleRows();
      await contextA.close();
      await contextB.close();
    }
  });

  test('when target already has an active table, accepting challenge surfaces outcome (game or error)', async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    try {
      await loginAs(pageB, e2eUserBEmail()!, e2eUserBPassword()!);
      await pageB.goto(ROUTES.free);
      await expect(pageB.getByTestId('free-lobby-root')).toBeVisible({ timeout: 25_000 });
      await pageB.getByTestId('free-find-match').first().click();
      await pageB.waitForURL((u) => u.pathname.startsWith('/game/'), { timeout: 45_000 });

      await loginAs(pageA, e2eUserEmail()!, e2eUserPassword()!);
      await sendPendingLiveChallengeFromFree(pageA);
      await openMatchRequestsInbox(pageB);
      const accept = pageB.locator('[data-testid^="challenge-accept-"]').first();
      await expect(accept).toBeVisible({ timeout: 60_000 });
      await accept.click();

      await expect
        .poll(
          async () => {
            const path = new URL(pageB.url()).pathname;
            if (path.startsWith('/game/')) return 'game';
            if (await pageB.getByTestId('requests-inbox-message').isVisible().catch(() => false)) {
              return 'msg';
            }
            return null;
          },
          { timeout: 45_000 }
        )
        .not.toBeNull();
    } finally {
      await teardownE2ePairStaleRows();
      await contextA.close();
      await contextB.close();
    }
  });
});
