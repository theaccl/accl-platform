import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  beginBotPendingClockDisplay,
  botPendingClockDisplayAt,
} from '@/lib/botPendingClockDisplay';

const movedAtMs = Date.parse('2026-09-02T12:00:10.000Z');

test.describe('pending bot clock display', () => {
  test('starts Black immediately from the full clock after White makes the first move', () => {
    const pending = beginBotPendingClockDisplay({
      sourceType: 'bot_game',
      tempo: 'live',
      liveTimeControl: '5m',
      currentTurn: 'white',
      nextTurn: 'black',
      whiteClockMs: 300_000,
      blackClockMs: 300_000,
      lastMoveAt: null,
      movedAtMs,
    });

    expect(pending).toMatchObject({
      activeTurn: 'black',
      whiteMs: 300_000,
      blackMs: 300_000,
    });
    expect(botPendingClockDisplayAt(pending!, movedAtMs + 1_500)).toMatchObject({
      activeTurn: 'black',
      whiteMs: 300_000,
      blackMs: 298_500,
    });
  });

  test('freezes the White human clock and ticks Black while the bot reply is pending', () => {
    const pending = beginBotPendingClockDisplay({
      sourceType: 'bot_game',
      tempo: 'live',
      liveTimeControl: '5m',
      currentTurn: 'white',
      nextTurn: 'black',
      whiteClockMs: 300_000,
      blackClockMs: 300_000,
      lastMoveAt: '2026-09-02T12:00:00.000Z',
      movedAtMs,
    });

    expect(pending).toEqual({
      activeTurn: 'black',
      startedAtMs: movedAtMs,
      whiteMs: 290_000,
      blackMs: 300_000,
    });
    expect(botPendingClockDisplayAt(pending!, movedAtMs + 2_500)).toMatchObject({
      activeTurn: 'black',
      whiteMs: 290_000,
      blackMs: 297_500,
    });
  });

  test('freezes the Black human clock and ticks White when the bot has White', () => {
    const pending = beginBotPendingClockDisplay({
      sourceType: 'bot_game',
      tempo: 'live',
      liveTimeControl: '5m',
      currentTurn: 'black',
      nextTurn: 'white',
      whiteClockMs: 280_000,
      blackClockMs: 270_000,
      lastMoveAt: '2026-09-02T12:00:00.000Z',
      movedAtMs,
    });

    expect(botPendingClockDisplayAt(pending!, movedAtMs + 1_000)).toMatchObject({
      activeTurn: 'white',
      whiteMs: 279_000,
      blackMs: 260_000,
    });
  });

  test('shows Fischer increment on the frozen human clock', () => {
    const pending = beginBotPendingClockDisplay({
      sourceType: 'bot_game',
      tempo: 'live',
      liveTimeControl: '5+5',
      currentTurn: 'white',
      nextTurn: 'black',
      whiteClockMs: 300_000,
      blackClockMs: 300_000,
      lastMoveAt: '2026-09-02T12:00:00.000Z',
      movedAtMs,
    });

    expect(pending?.whiteMs).toBe(295_000);
  });

  test('does not create an optimistic bot clock for non-bot or non-live games', () => {
    const common = {
      liveTimeControl: '5m',
      currentTurn: 'white',
      nextTurn: 'black',
      whiteClockMs: 300_000,
      blackClockMs: 300_000,
      lastMoveAt: '2026-09-02T12:00:00.000Z',
      movedAtMs,
    };

    expect(beginBotPendingClockDisplay({ ...common, sourceType: 'challenge', tempo: 'live' })).toBeNull();
    expect(beginBotPendingClockDisplay({ ...common, sourceType: 'bot_game', tempo: 'correspondence' })).toBeNull();
  });

  test('game page wires the pending snapshot and does not replay think_ms as a second delay', () => {
    const pageSource = readFileSync(
      join(process.cwd(), 'app', 'game', '[id]', 'page.tsx'),
      'utf8',
    );

    expect(pageSource).toContain('setPendingBotClock(');
    expect(pageSource).toContain('beginBotPendingClockDisplay({');
    expect(pageSource).toContain('botPendingClockDisplayAt(pendingBotClock, clockNowMs)');
    expect(pageSource).toContain('setPendingBotClock(null)');
    expect(pageSource).not.toContain('window.setTimeout(resolve, thinkDelayMs)');
  });

  test('pauses the stale local timeout watcher during the atomic bot turn request', () => {
    const pageSource = readFileSync(
      join(process.cwd(), 'app', 'game', '[id]', 'page.tsx'),
      'utf8',
    );

    const timeoutEffect = pageSource.slice(
      pageSource.indexOf("if (!game || game.status !== 'active') return;"),
      pageSource.indexOf('const handleResign = async'),
    );
    expect(timeoutEffect).toContain('if (pendingBotClock) return;');
    expect(timeoutEffect).toContain('[game, gameId, pendingBotClock, scheduleLiveTimeoutFinish]');
  });
});
