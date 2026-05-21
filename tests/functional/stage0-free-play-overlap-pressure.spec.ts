import { test, expect } from '@playwright/test';

import { hasTwoUserE2ECredentials } from '../fixtures/env';
import { ROUTES } from '../fixtures/routes';
import { teardownE2ePairStaleRows } from '../helpers/e2eTeardown';
import { gameIdFromUrl } from '../helpers/gameUrl';
import { setupAcceptedLiveChallenge, sendPendingLiveChallengeFromFree } from '../helpers/liveChallengePair';

/**
 * Stage 0 — concurrent operational overlap (not serial happy-path).
 * Surfaces realtime sovereignty conflicts: live seat + lobby + nexus + profile + chat + reconnect + challenge.
 */
test.describe('Stage 0 — free-play overlap pressure (concurrent)', () => {
  test.skip(!hasTwoUserE2ECredentials(), 'Set E2E_USER_EMAIL, E2E_USER_PASSWORD, E2E_USER_B_EMAIL, E2E_USER_B_PASSWORD');
  test.describe.configure({ timeout: 300_000 });

  test('simultaneous live game, navigation hops, chat, reconnect, challenge, and spectate', async ({
    browser,
  }) => {
    await teardownE2ePairStaleRows();
    const { pageA, pageB, gameId, dispose } = await setupAcceptedLiveChallenge(browser);

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
          await panel.locator('textarea').first().fill(`overlap-${Date.now()}`);
          const send = pageA.locator('[data-testid^="game-chat-send-"]').first();
          await send.click();
          await expect(send).toBeEnabled({ timeout: 15_000 });
        })(),

        (async () => {
          await pageB.reload({ waitUntil: 'domcontentloaded' });
          await expect(pageB.getByTestId('game-startup-snapshot')).toBeAttached({ timeout: 30_000 });
          expect(gameIdFromUrl(pageB.url())).toBe(gameId);
        })(),

        (async () => {
          await tabANexus.goto('/nexus');
          await expect(
            tabANexus.getByTestId('nexus-operational-games').or(tabANexus.getByRole('heading', { name: /NEXUS/i })),
          ).toBeVisible({ timeout: 30_000 });
        })(),

        (async () => {
          await tabAProfile.goto('/profile');
          await tabAProfile.waitForURL(/\/profile\//, { timeout: 30_000 });
          await expect(tabAProfile.getByTestId('public-profile-root')).toBeAttached({ timeout: 30_000 });
        })(),

        (async () => {
          await tabBLobby.goto(ROUTES.free);
          await expect(tabBLobby.getByTestId('free-lobby-root')).toBeVisible({ timeout: 30_000 });
          await expect(tabBLobby.getByTestId('free-primary-game').or(tabBLobby.getByText(/YOUR MOVE|WAITING/i))).toBeVisible({
            timeout: 25_000,
          });
        })(),

        (async () => {
          await tabBDaily.goto('/free/lobby/daily');
          await expect(tabBDaily.getByTestId('free-lobby-mode-room-daily')).toBeVisible({ timeout: 30_000 });
        })(),

        (async () => {
          await sendPendingLiveChallengeFromFree(tabAChallenge);
        })(),

        (async () => {
          await tabSpectate.goto(`${ROUTES.game(gameId)}?spectate=1`);
          await expect(tabSpectate.getByTestId('game-startup-snapshot')).toBeAttached({ timeout: 30_000 });
          await expect(tabSpectate.getByTestId('game-tester-chat-panels')).toHaveCount(0);
        })(),
      ]);

      await expect(pageA.getByTestId('accl-e2e-board')).toBeVisible({ timeout: 15_000 });
      await expect(pageB.getByTestId('accl-e2e-board')).toBeVisible({ timeout: 15_000 });
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
