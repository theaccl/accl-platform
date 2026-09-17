import { expect, test, type Page } from '@playwright/test';
import { Chess } from 'chess.js';

import { e2eUserEmail, e2eUserPassword, hasE2ECredentials } from '../fixtures/env';
import { loginAs } from '../helpers/auth';
import { clickBoardSquare, playOpeningE2E4 } from '../helpers/board';
import { readLiveClockTexts } from '../helpers/clock';

test.describe('Play Computer clock handoff', () => {
  test.skip(!hasE2ECredentials(), 'Set E2E_USER_EMAIL and E2E_USER_PASSWORD');
  test.describe.configure({ mode: 'serial', timeout: 120_000 });

  async function startBotGame(page: Page, difficulty: 'Beginner' | 'Master' = 'Beginner') {
    await loginAs(page, e2eUserEmail()!, e2eUserPassword()!);
    await page.goto('/free/lobby/blitz');
    await expect(page.getByTestId('free-lobby-play-computer-panel')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: difficulty, exact: true }).click();
    await page.getByTestId('free-lobby-play-computer-tc-blitz-3m').click();
    await page.getByTestId('free-lobby-play-computer-start-blitz').click();
    await expect(page).toHaveURL(/\/game\/[0-9a-f-]+$/i, { timeout: 30_000 });
    await expect(page.getByTestId('game-board')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('game-turn-indicator')).toContainText('YOUR TURN');
  }

  async function expectBotHandoffThenHuman(page: Page, playMove: () => Promise<void>) {
    await playMove();

    const clock = page.getByTestId('digital-chess-clock');
    await expect(clock).toHaveAttribute('data-active-turn', 'black', { timeout: 1_000 });
    await expect(page.getByTestId('game-turn-indicator')).toContainText("OPPONENT'S TURN");
    await expect(page.getByTestId('computer-thinking')).toBeVisible({ timeout: 1_000 });
    const atHandoff = await readLiveClockTexts(page);
    await expect
      .poll(
        async () => {
          const whileThinking = await readLiveClockTexts(page);
          return {
            white: whileThinking.white,
            blackChanged: whileThinking.black !== atHandoff.black,
            activeTurn: await clock.getAttribute('data-active-turn'),
          };
        },
        { timeout: 1_150 },
      )
      .toEqual({ white: atHandoff.white, blackChanged: true, activeTurn: 'black' });
    await expect(page.getByTestId('game-turn-indicator')).toContainText("OPPONENT'S TURN");

    await expect(page.getByTestId('game-turn-indicator')).toContainText('YOUR TURN', {
      timeout: 30_000,
    });
    await expect(clock).toHaveAttribute('data-active-turn', 'white', { timeout: 2_000 });
    await expect(page.getByTestId('computer-thinking')).toHaveCount(0);
  }

  async function playFirstLegalWhiteMoveFromSnapshot(page: Page) {
    const fen = await page.getByTestId('game-startup-snapshot').getAttribute('data-fen');
    expect(fen).toBeTruthy();
    const board = new Chess(fen!);
    expect(board.turn()).toBe('w');
    const move = board.moves({ verbose: true })[0];
    expect(move).toBeTruthy();
    await clickBoardSquare(page, move.from);
    await clickBoardSquare(page, move.to);
  }

  async function resignIfActive(page: Page) {
    const resign = page.getByTestId('resign-button');
    if (await resign.isVisible().catch(() => false)) await resign.click();
  }

  test('first move and three consecutive bot turns transfer the active clock immediately', async ({ page }) => {
    await startBotGame(page, 'Master');
    try {
      await expect(page.getByTestId('digital-chess-clock')).toHaveAttribute('data-active-turn', 'none');
      await expectBotHandoffThenHuman(page, () => playOpeningE2E4(page));
      await expectBotHandoffThenHuman(page, () => playFirstLegalWhiteMoveFromSnapshot(page));
      await expectBotHandoffThenHuman(page, () => playFirstLegalWhiteMoveFromSnapshot(page));
    } finally {
      await resignIfActive(page);
    }
  });

  test('rejected move rolls the optimistic turn and clock back', async ({ page }) => {
    await startBotGame(page);
    let releaseRejection = () => {};
    const rejectionGate = new Promise<void>((resolve) => {
      releaseRejection = resolve;
    });
    await page.route('**/api/game/submit-move', async (route) => {
      await rejectionGate;
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'bot_no_candidates', message: 'Computer move was rejected for this test.' },
          human_move_applied: false,
          bot_move_applied: false,
        }),
      });
    });

    await playOpeningE2E4(page);
    await expect(page.getByTestId('digital-chess-clock')).toHaveAttribute('data-active-turn', 'black');
    await expect(page.getByTestId('computer-thinking')).toBeVisible();
    releaseRejection();

    await expect(page.getByTestId('game-turn-indicator')).toContainText('YOUR TURN');
    await expect(page.getByTestId('digital-chess-clock')).toHaveAttribute('data-active-turn', 'none');
    await expect(page.getByText('Computer move was rejected for this test.')).toBeVisible();
    await expect(page.getByTestId('game-startup-snapshot')).toHaveAttribute('data-last-move-at', '');
    await page.unroute('**/api/game/submit-move');
    await resignIfActive(page);
  });

  test('mobile keeps both clocks visible through the bot handoff', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await startBotGame(page, 'Master');
    try {
      await expectBotHandoffThenHuman(page, () => playOpeningE2E4(page));
      await expect(page.getByTestId('clock-white')).toBeVisible();
      await expect(page.getByTestId('clock-black')).toBeVisible();
    } finally {
      await resignIfActive(page);
    }
  });

  test('refresh after the server commits a hidden bot response reconciles to authoritative state', async ({ page }) => {
    await startBotGame(page, 'Master');
    let releaseResponse = () => {};
    let markServerCommitted = () => {};
    const responseGate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    const serverCommitted = new Promise<void>((resolve) => {
      markServerCommitted = resolve;
    });
    await page.route('**/api/game/submit-move', async (route) => {
      const response = await route.fetch();
      markServerCommitted();
      await responseGate;
      await route.fulfill({ response });
    });

    try {
      await playOpeningE2E4(page);
      await expect(page.getByTestId('digital-chess-clock')).toHaveAttribute('data-active-turn', 'black');
      await serverCommitted;
      const reload = page.reload();
      releaseResponse();
      await reload;
      await expect(page.getByTestId('game-board')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('game-turn-indicator')).toContainText('YOUR TURN', {
        timeout: 30_000,
      });
      await expect(page.getByTestId('digital-chess-clock')).toHaveAttribute('data-active-turn', 'white');
    } finally {
      releaseResponse();
      await page.unroute('**/api/game/submit-move');
      await resignIfActive(page);
    }
  });

  test('lost response body reconciles the committed turn instead of undoing it', async ({ page }) => {
    await startBotGame(page, 'Master');
    await page.route('**/api/game/submit-move', async (route) => {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, bot_move_applied: true }),
      });
    });

    try {
      await playOpeningE2E4(page);
      await expect(page.getByTestId('digital-chess-clock')).toHaveAttribute('data-active-turn', 'black');
      await expect(page.getByTestId('game-turn-indicator')).toContainText('YOUR TURN', {
        timeout: 30_000,
      });
      await expect(page.getByTestId('digital-chess-clock')).toHaveAttribute('data-active-turn', 'white');
      await expect(page.getByText(/board was restored from the server/i)).toBeVisible();
    } finally {
      await page.unroute('**/api/game/submit-move');
      await resignIfActive(page);
    }
  });
});
