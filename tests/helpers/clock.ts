import type { Page } from '@playwright/test';

/** Full text under `clock-white` / `clock-black` includes labels + digits. */
export async function readLiveClockTexts(page: Page): Promise<{ white: string; black: string }> {
  const white = (await page.getByTestId('clock-white').innerText()).trim();
  const black = (await page.getByTestId('clock-black').innerText()).trim();
  return { white, black };
}
