import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** Legacy “game ready” banner was removed; guard against regressions reintroducing ghost ready UI. */
export async function expectNoGhostReadyBanner(page: Page): Promise<void> {
  await expect(page.getByTestId('game-ready-banner')).toHaveCount(0);
}
