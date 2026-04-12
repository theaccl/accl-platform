import { test, expect } from '@playwright/test';

import { hasE2ECredentials, e2eUserEmail, e2eUserPassword } from '../fixtures/env';
import { ROUTES } from '../fixtures/routes';
import { loginAs } from '../helpers/auth';
import {
  assertGamePageOpenSeatSolo,
  gotoFreeLobbyGated,
} from '../helpers/openSeatGameAsserts';
import { waitForGameUrl } from '../helpers/gameUrl';

test.describe('no solo-start (waiting for black)', () => {
  test.skip(!hasE2ECredentials(), 'Set E2E_USER_EMAIL and E2E_USER_PASSWORD');
  test.describe.configure({ timeout: 90_000 });

  /**
   * `/free` Find Match creates a `games` row: `status` active, `black_player_id` null until join.
   * That is an **open seat**, not a finished record and not a two-player “started” board — moves and
   * live clock ticking stay off until Black is seated (`canPlayMoves` / `isLiveDailyClockTicking`).
   */
  test('solo seat: game page blocks play and pre-start timing (free lobby)', async ({ page }) => {
    await loginAs(page, e2eUserEmail()!, e2eUserPassword()!);
    await gotoFreeLobbyGated(page);
    await page.getByTestId('free-find-match').first().click();
    await waitForGameUrl(page);
    await assertGamePageOpenSeatSolo(page);
  });

  test('solo seat shows waiting line, not YOUR TURN (home find match)', async ({ page }) => {
    await loginAs(page, e2eUserEmail()!, e2eUserPassword()!);
    await page.goto(ROUTES.home);
    await page.getByTestId('home-find-match').click();
    await waitForGameUrl(page);
    const turn = page.getByTestId('game-turn-indicator');
    await expect(turn).toHaveAttribute('data-game-state', 'waiting', { timeout: 20_000 });
    await expect(turn).not.toContainText('YOUR TURN');
    await expect(page.locator('[data-testid="digital-chess-clock"]')).toHaveCount(0);
    await expect(page.getByTestId('game-board')).toBeVisible();
  });
});
