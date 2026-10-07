import { Chess } from 'chess.js';
import { expect, test } from '@playwright/test';

import { buildBotCandidatesFromFen } from '@/lib/bot/botCandidates';
import { botProfileForClock, getBotDifficultyProfile, randomThinkTimeMs } from '@/lib/bot/botDifficulty';

test.describe('Play Computer time pressure', () => {
  const master = getBotDifficultyProfile(6);

  test('one-minute games skip engine startup and bound the visible pause', async () => {
    const profile = botProfileForClock(master, 'live', '1m', 60_000);
    let engineCalls = 0;
    const candidates = await buildBotCandidatesFromFen(new Chess().fen(), profile, {
      evaluatePosition: async () => {
        engineCalls += 1;
        throw new Error('engine must not run for one-minute play');
      },
    });

    expect(profile.useEngine).toBe(false);
    expect(profile.thinkTimeMaxMs).toBe(500);
    expect(randomThinkTimeMs(profile)).toBeLessThanOrEqual(500);
    expect(engineCalls).toBe(0);
    expect(candidates.length).toBeGreaterThan(0);
  });

  test('two-minute games use bounded shallow search while longer games retain deep search', () => {
    const bullet = botProfileForClock(master, 'live', '2+1', 120_000);
    const rapid = botProfileForClock(master, 'live', '10m', 600_000);

    expect(bullet.useEngine).toBe(true);
    expect(bullet.engineDepth).toBe(8);
    expect(bullet.engineTimeoutMs).toBe(3_000);
    expect(bullet.thinkTimeMaxMs).toBe(750);
    expect(rapid).toBe(master);
    expect(rapid.useEngine).toBe(true);
  });

  test('quiet positions use a shorter search than tactical positions', async () => {
    const searches: Array<{ depth: number; timeoutMs: number }> = [];
    const evaluatePosition = async (
      _fen: string,
      options: { depth: number; multiPv: number; timeoutMs: number },
    ) => {
      searches.push(options);
      return { bestMove: null, lines: [] };
    };
    await buildBotCandidatesFromFen(new Chess().fen(), master, { evaluatePosition });

    const tacticalBoard = new Chess();
    tacticalBoard.move('e4');
    tacticalBoard.move('d5');
    await buildBotCandidatesFromFen(tacticalBoard.fen(), master, { evaluatePosition });

    expect(searches).toHaveLength(2);
    expect(searches[0]).toMatchObject({ depth: 11, timeoutMs: 3_000 });
    expect(searches[1]).toMatchObject({ depth: 14, timeoutMs: 12_000 });
  });

  test('an immediate mate skips the engine entirely', async () => {
    const board = new Chess();
    board.move('f3');
    board.move('e5');
    board.move('g4');
    let engineCalls = 0;
    const candidates = await buildBotCandidatesFromFen(board.fen(), master, {
      evaluatePosition: async () => {
        engineCalls += 1;
        throw new Error('mate in one must not start the engine');
      },
    });

    expect(engineCalls).toBe(0);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.move).toBe('d8h4');
  });

  test('longer games switch to fast replies under clock pressure', () => {
    const bulletUnderPressure = botProfileForClock(master, 'live', '2+1', 60_000);
    const pressured = botProfileForClock(master, 'live', '10m', 25_000);
    const nearlyExpired = botProfileForClock(master, 'live', '10m', 1_000);

    expect(bulletUnderPressure.useEngine).toBe(false);
    expect(pressured.useEngine).toBe(false);
    expect(pressured.thinkTimeMaxMs).toBe(400);
    expect(nearlyExpired.thinkTimeMaxMs).toBe(100);
    expect(nearlyExpired.thinkTimeMinMs).toBeLessThanOrEqual(nearlyExpired.thinkTimeMaxMs);
  });

  test('non-live games keep their existing difficulty profile', () => {
    expect(botProfileForClock(master, 'daily', '30m', 10_000)).toBe(master);
    expect(botProfileForClock(master, 'correspondence', '1d', 10_000)).toBe(master);
  });
});
