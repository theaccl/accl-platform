import { expect, test } from '@playwright/test';

import {
  botRevealDelayForClient,
  botRevealDelayForResponse,
  botTimeoutFinishBeforeMove,
} from '@/lib/bot/botClockTransition';

test.describe('Play Computer clock transition', () => {
  test('returns a relative reveal delay that does not depend on the browser wall clock', () => {
    expect(
      botRevealDelayForResponse('2026-09-17T12:00:02.000Z', 3_500, Date.parse('2026-09-17T12:00:00.000Z')),
    ).toBe(2_000);
    expect(botRevealDelayForClient(2_000, 3_500)).toBe(2_000);
    expect(botRevealDelayForClient(99_000, 3_500)).toBe(3_500);
    expect(botRevealDelayForClient(null, 1_200)).toBe(1_200);
  });

  test('finishes the game before a bot move that overruns a zero-increment clock', () => {
    expect(
      botTimeoutFinishBeforeMove({
        tempo: 'live',
        liveTimeControl: '2+0',
        botMoverColor: 'black',
        lastMoveAt: '2026-09-17T12:00:00.000Z',
        movedAt: new Date('2026-09-17T12:00:02.000Z'),
        whiteClockMs: 50_000,
        blackClockMs: 1_500,
      }),
    ).toEqual({ result: 'white_win', endReason: 'timeout' });
  });

  test('treats exactly zero remaining as timeout', () => {
    expect(
      botTimeoutFinishBeforeMove({
        tempo: 'live',
        liveTimeControl: '2+0',
        botMoverColor: 'black',
        lastMoveAt: '2026-09-17T12:00:00.000Z',
        movedAt: new Date('2026-09-17T12:00:02.000Z'),
        whiteClockMs: 50_000,
        blackClockMs: 2_000,
      }),
    ).toEqual({ result: 'white_win', endReason: 'timeout' });
  });

  test('checks timeout before Fischer increment is added', () => {
    expect(
      botTimeoutFinishBeforeMove({
        tempo: 'live',
        liveTimeControl: '3+2',
        botMoverColor: 'black',
        lastMoveAt: '2026-09-17T12:00:00.000Z',
        movedAt: new Date('2026-09-17T12:00:02.000Z'),
        whiteClockMs: 50_000,
        blackClockMs: 1_500,
      }),
    ).toEqual({ result: 'white_win', endReason: 'timeout' });
  });

  test('allows the bot move while positive time remains', () => {
    expect(
      botTimeoutFinishBeforeMove({
        tempo: 'live',
        liveTimeControl: '3m',
        botMoverColor: 'black',
        lastMoveAt: '2026-09-17T12:00:00.000Z',
        movedAt: new Date('2026-09-17T12:00:02.000Z'),
        whiteClockMs: 50_000,
        blackClockMs: 2_001,
      }),
    ).toBeNull();
  });
});
