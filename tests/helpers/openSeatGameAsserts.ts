import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { ROUTES } from '../fixtures/routes';

/** Deterministic `/free` shell: session resolved (not `requests` vs `games`). */
export async function gotoFreeLobbyGated(page: Page): Promise<void> {
  await page.goto(ROUTES.free);
  await expect(page.getByTestId('free-lobby-root')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('free-lobby-ready')).toBeAttached({ timeout: 30_000 });
}

/**
 * Game page when `games.black_player_id` is still null (open seat).
 * Aligns with `canPlayMoves` / no live clock until both seated + post-first-move tick rules.
 */
export async function assertGamePageOpenSeatSolo(page: Page): Promise<void> {
  await expect(page.getByTestId('game-row-status')).toContainText(/active/i, { timeout: 15_000 });
  const turn = page.getByTestId('game-turn-indicator');
  await expect(turn).toHaveAttribute('data-game-state', 'waiting', { timeout: 20_000 });
  await expect(turn).not.toContainText('YOUR TURN');
  await expect(page.locator('[data-testid="digital-chess-clock"]')).toHaveCount(0);
  await expect(page.getByTestId('game-board')).toBeVisible();
  const snap = page.getByTestId('game-startup-snapshot');
  await expect(snap).toBeAttached();
  expect((await snap.getAttribute('data-last-move-at'))?.trim() ?? '').toBe('');
  expect((await snap.getAttribute('data-move-deadline-at'))?.trim() ?? '').toBe('');
}

/**
 * After B joins, wait until Player A's client reflects a two-seat row (realtime/subscription convergence).
 */
export async function waitForGameTurnIndicatorSeated(page: Page): Promise<void> {
  await expect(page.getByTestId('game-turn-indicator')).toHaveAttribute('data-game-state', 'seated', {
    timeout: 60_000,
  });
}

/**
 * Both players seated, live board, **before** first move: clocks may render but must not tick;
 * move timing fields still unset.
 */
export async function assertGamePagePairPreFirstMove(page: Page): Promise<void> {
  const turn = page.getByTestId('game-turn-indicator');
  await expect(turn).toHaveAttribute('data-game-state', 'seated', { timeout: 30_000 });
  await expect(turn).not.toHaveAttribute('data-game-state', 'waiting');
  const clock = page.getByTestId('digital-chess-clock');
  await expect(clock).toBeVisible({ timeout: 20_000 });
  await expect(clock).toBeInViewport();
  await expect(clock).toHaveAttribute('data-clock-ticking', 'false');
  const snap = page.getByTestId('game-startup-snapshot');
  await expect(snap).toBeAttached();
  expect((await snap.getAttribute('data-last-move-at'))?.trim() ?? '').toBe('');
  expect((await snap.getAttribute('data-move-deadline-at'))?.trim() ?? '').toBe('');
}

/** Lobby: newest open seat is the prominent wait card (not the green primary in-progress strip). */
export async function assertFreeLobbyShowsWaitingSeatNotPrimaryInProgress(
  page: Page,
  gameId: string
): Promise<void> {
  await gotoFreeLobbyGated(page);
  await expect(page.getByTestId('free-primary-game')).toHaveCount(0);
  const waitSurface = page.locator(`[data-active-game-id="${gameId}"]`);
  await expect(waitSurface).toBeVisible({ timeout: 20_000 });
  await expect(waitSurface).toHaveAttribute('data-seat-phase', 'waiting');
}
