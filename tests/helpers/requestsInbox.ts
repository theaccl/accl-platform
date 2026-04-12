import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { ROUTES } from '../fixtures/routes';

/** Deterministic inbox load: `/requests` + root visible (do not assume incoming row on first paint). */
export async function openMatchRequestsInbox(page: Page): Promise<void> {
  await page.goto(ROUTES.requests);
  await expect(page.getByTestId('requests-inbox-root')).toBeVisible({ timeout: 30_000 });
}
