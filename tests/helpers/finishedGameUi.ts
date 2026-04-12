import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** Assertions shared by resign, draw-agreement, and other finished-game flows (Phase 6). */
export async function expectSharedFinishedGameUi(page: Page, bannerTimeoutMs = 30_000) {
  await expect(page.getByTestId('game-over-banner')).toBeVisible({ timeout: bannerTimeoutMs });
  await expect(page.getByTestId('game-row-status')).toContainText('finished');
  await expect(page.getByTestId('resign-button')).toHaveCount(0);
  await expect(page.getByTestId('offer-draw-button')).toHaveCount(0);
}

/** Finished banner exposes `data-result` + `data-end-reason` from the `games` row (Phase 7 parity). */
export async function expectFinishedParitySummary(
  page: Page,
  attrs: { result: string; endReason: string },
  opts?: { bannerTimeoutMs?: number }
) {
  const bannerTimeoutMs = opts?.bannerTimeoutMs ?? 30_000;
  await expectSharedFinishedGameUi(page, bannerTimeoutMs);
  const el = page.getByTestId('finished-result-summary');
  await expect(el).toHaveAttribute('data-result', attrs.result, { timeout: 10_000 });
  await expect(el).toHaveAttribute('data-end-reason', attrs.endReason, { timeout: 10_000 });
}

export async function expectFinishedEndReason(page: Page, endReason: string) {
  await expect(page.getByTestId('finished-result-summary')).toHaveAttribute(
    'data-end-reason',
    endReason,
    { timeout: 10_000 }
  );
}
