import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildFinishedGameRatingSummary,
  formatRatingSideLine,
} from '@/lib/finishedGameRatingSummary';

test.describe('buildFinishedGameRatingSummary', () => {
  test('builds mode line and both sides from p1 snapshots', () => {
    const summary = buildFinishedGameRatingSummary({
      rated: true,
      tempo: 'live',
      liveTimeControl: '1+0',
      ratingApplied: true,
      ratingLastUpdate: {
        p1_white: { before: 1437, after: 1455, delta: 18 },
        p1_black: { before: 1479, after: 1461, delta: -18 },
      },
    });
    expect(summary.modeLine).toContain('Rated');
    expect(summary.white).toEqual({
      label: 'White',
      before: 1437,
      after: 1455,
      delta: 18,
    });
    expect(summary.black?.delta).toBe(-18);
    expect(formatRatingSideLine(summary.white!)).toBe('1437 → 1455  (+18)');
  });

  test('unrated games show note without side lines', () => {
    const summary = buildFinishedGameRatingSummary({
      rated: false,
      tempo: 'live',
      liveTimeControl: '1+0',
      ratingLastUpdate: null,
    });
    expect(summary.white).toBeNull();
    expect(summary.black).toBeNull();
    expect(summary.note).toMatch(/Unrated/i);
  });

  test('does not expose ledger or internal keys in summary strings', () => {
    const summary = buildFinishedGameRatingSummary({
      rated: true,
      tempo: 'live',
      liveTimeControl: '5m',
      ratingApplied: true,
      ratingLastUpdate: {
        ledger: { insert_attempts: 2 },
        elo_meta: { rating_model_version: 'x' },
        p1_white: { before: 1500, after: 1510, delta: 10 },
        p1_black: { before: 1500, after: 1490, delta: -10 },
      },
    });
    const blob = JSON.stringify(summary);
    expect(blob).not.toContain('ledger');
    expect(blob).not.toContain('insert_attempts');
    expect(blob).not.toContain('elo_meta');
    expect(blob).not.toContain('rating_model_version');
  });
});

test.describe('finished game result cleanup wiring (static)', () => {
  test('game page gates raw JSON behind development build', () => {
    const page = readFileSync(join(process.cwd(), 'app', 'game', '[id]', 'page.tsx'), 'utf8');
    expect(page).toContain('<FinishedGameRatingSummary');
    expect(page).toContain('{IS_DEV_BUILD && !isPublicViewer ? (');
    expect(page).toContain('data-testid="rating-update-debug"');
    expect(page).toContain('rating-settlement-debug-disclosure');
    expect(page).not.toContain('JSON.stringify(game.rating_last_update, null, 2)\n          </pre>\n          ) : null}\n          {!isPublicViewer');
  });

  test('no settlement write paths added in summary module', () => {
    const lib = readFileSync(join(process.cwd(), 'lib', 'finishedGameRatingSummary.ts'), 'utf8');
    expect(lib).not.toContain('finish_game');
    expect(lib).not.toContain('player_rating_history_ledger');
    expect(lib).not.toMatch(/\.insert\(/);
    expect(lib).not.toMatch(/\.update\(/);
  });
});
