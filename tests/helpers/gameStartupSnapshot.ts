import type { Page } from '@playwright/test';

/** Mirrors hidden `game-startup-snapshot` attributes (deterministic sync checks). */
export type GameStartupSnapshotAttrs = {
  fen: string;
  turn: string;
  lastMoveAt: string;
  moveDeadlineAt: string;
};

export async function readGameStartupSnapshot(page: Page): Promise<GameStartupSnapshotAttrs> {
  const el = page.getByTestId('game-startup-snapshot');
  const fen = (await el.getAttribute('data-fen')) ?? '';
  const turn = (await el.getAttribute('data-turn')) ?? '';
  const lastMoveAt = (await el.getAttribute('data-last-move-at')) ?? '';
  const moveDeadlineAt = (await el.getAttribute('data-move-deadline-at')) ?? '';
  return { fen, turn, lastMoveAt, moveDeadlineAt };
}
