import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { gotoFreeLobbyGated } from './openSeatGameAsserts';

/** Finished rows are filtered out of `activeGames` on `/free` — no waiting row, no in-progress card for this id. */
export async function assertFinishedGameAbsentFromFreeActiveLists(page: Page, gameId: string): Promise<void> {
  await gotoFreeLobbyGated(page);
  await expect(page.getByTestId(`free-active-game-row-${gameId}`)).toHaveCount(0);
  await expect(page.locator(`[data-active-game-id="${gameId}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-primary-game-id="${gameId}"]`)).toHaveCount(0);
}

/**
 * `showLiveClocks` / turn UI short-circuit when `status === 'finished'` (no live ticking clock surface).
 */
export async function assertFinishedRecordPageNoLiveTimingUi(page: Page): Promise<void> {
  await expect(page.getByTestId('digital-chess-clock')).toHaveCount(0);
  await expect(page.getByTestId('game-turn-indicator')).toHaveCount(0);
  await expect(page.getByTestId('game-startup-snapshot')).toHaveAttribute('data-turn', '');
  await expect(page.getByTestId('game-row-status')).toContainText('finished');
}
