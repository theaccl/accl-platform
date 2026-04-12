import type { Page } from '@playwright/test';

import { ROUTES } from '../fixtures/routes';

export async function openHome(page: Page): Promise<void> {
  await page.goto(ROUTES.home);
}

export async function openFreeLobby(page: Page): Promise<void> {
  await page.goto(ROUTES.free);
}
