import { test, expect } from '@playwright/test';

import { overlapE2EPair } from '../fixtures/env';
import { ROUTES } from '../fixtures/routes';
import { teardownE2ePairStaleRows } from '../helpers/e2eTeardown';
import { gameIdFromUrl } from '../helpers/gameUrl';
import { sendPendingLiveChallengeFromFree } from '../helpers/liveChallengePair';
import { setupLiveOpenSeatPair } from '../helpers/openSeatLivePair';

/**
 * Stage 0 — concurrent operational overlap (not serial happy-path).
 * Surfaces realtime sovereignty conflicts: live seat + lobby + nexus + profile + chat + reconnect + challenge.
 */
test.describe('Stage 0 — free-play overlap pressure (concurrent)', () => {
  const pair = overlapE2EPair();
  test.skip(!pair, 'Set E2E_USER_* pair or E2E_MODERATOR_* + E2E_NON_MODERATOR_* in .env.local');
  test.describe.configure({ timeout: 300_000 });

  test('simultaneous live game, navigation hops, chat, reconnect, challenge, and spectate', async ({
    browser,
  }) => {
    await teardownE2ePairStaleRows({ aEmail: pair!.aEmail, bEmail: pair!.bEmail });
    const { pageA, pageB, gameId, dispose } = await setupLiveOpenSeatPair(browser, pair!);

    const tabANexus = await pageA.context().newPage();
    const tabAProfile = await pageA.context().newPage();
    const tabBLobby = await pageB.context().newPage();
    const tabBDaily = await pageB.context().newPage();
    const spectateCtx = await browser.newContext();
    const tabSpectate = await spectateCtx.newPage();
    const tabAChallenge = await pageA.context().newPage();

    try {
      await Promise.all([
        (async () => {
          await expect(pageA.getByTestId('game-tester-chat-panels')).toBeVisible({ timeout: 25_000 });
          const panel = pageA.getByTestId('game-tester-chat-panels');
          const msg = `overlap-${Date.now()}`;
          await panel.locator('textarea').first().fill(msg);
          const send = pageA.locator('[data-testid^="game-chat-send-"]').first();
          await expect(send).toBeEnabled({ timeout: 15_000 });
          await send.click();
          await expect(send).not.toHaveText('Sending…', { timeout: 15_000 });
        })(),

        (async () => {
          await pageB.reload({ waitUntil: 'domcontentloaded' });
          await expect(pageB.getByTestId('game-startup-snapshot')).toBeAttached({ timeout: 30_000 });
          expect(gameIdFromUrl(pageB.url())).toBe(gameId);
        })(),

        (async () => {
          await tabANexus.goto('/nexus');
          await expect(tabANexus.getByTestId('nexus-operational-games')).toBeVisible({ timeout: 30_000 });
        })(),

        (async () => {
          await tabAProfile.goto('/profile');
          await tabAProfile.waitForURL(/\/profile\//, { timeout: 30_000 });
          await expect(tabAProfile.getByTestId('public-profile-root')).toBeAttached({ timeout: 30_000 });
        })(),

        (async () => {
          await tabBLobby.goto(ROUTES.free);
          await expect(tabBLobby.getByTestId('free-lobby-root')).toBeVisible({ timeout: 30_000 });
          await expect(tabBLobby.getByTestId('free-lobby-ready')).toBeAttached({ timeout: 30_000 });
          await expect(tabBLobby.getByTestId('free-lobby-current-games')).toBeVisible({ timeout: 25_000 });
        })(),

        (async () => {
          await tabBDaily.goto('/free/lobby/daily');
          await expect(tabBDaily.getByTestId('free-lobby-mode-room-daily')).toBeVisible({ timeout: 30_000 });
        })(),

        (async () => {
          await sendPendingLiveChallengeFromFree(tabAChallenge, pair!.bEmail);
        })(),

        (async () => {
          await tabSpectate.goto(`${ROUTES.game(gameId)}?spectate=1`);
          await expect(tabSpectate.getByTestId('game-startup-snapshot')).toBeAttached({ timeout: 30_000 });
          await expect(tabSpectate.getByTestId('game-tester-chat-panels')).toHaveCount(0);
        })(),
      ]);

      await expect(pageA.getByTestId('game-board')).toBeVisible({ timeout: 15_000 });
      await expect(pageB.getByTestId('game-board')).toBeVisible({ timeout: 15_000 });
    } finally {
      await tabANexus.close().catch(() => {});
      await tabAProfile.close().catch(() => {});
      await tabBLobby.close().catch(() => {});
      await tabBDaily.close().catch(() => {});
      await tabAChallenge.close().catch(() => {});
      await spectateCtx.close().catch(() => {});
      await dispose();
    }
  });
});
