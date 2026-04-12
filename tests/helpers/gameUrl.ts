import type { Page } from '@playwright/test';

const GAME_PATH_RE = /\/game\/([^/?#]+)/;

export function gameIdFromUrl(url: string): string {
  const m = url.match(GAME_PATH_RE);
  if (!m?.[1]) throw new Error(`No /game/:id in URL: ${url}`);
  return m[1];
}

export async function waitForGameUrl(
  page: Page,
  timeout = 60_000
): Promise<string> {
  await page.waitForURL((u) => GAME_PATH_RE.test(u.pathname), { timeout });
  return gameIdFromUrl(page.url());
}
