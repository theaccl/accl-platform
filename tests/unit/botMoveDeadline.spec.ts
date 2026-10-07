import { Chess } from 'chess.js';
import { expect, test } from '@playwright/test';
import { botMoveBudgetMs } from '@/lib/bot/botMoveBudget';
import { buildBotCandidatesFromFen } from '@/lib/bot/botCandidates';
import { getBotDifficultyProfile } from '@/lib/bot/botDifficulty';

const initialFen = new Chess().fen();
function budget(move: number, clockMs = 600_000) {
  return botMoveBudgetMs({ fen: initialFen.replace(/ 1$/, ` ${move}`),
    tempo: 'live', liveTimeControl: '10m', clockMs, lastMoveAt: null });
}

test('phase deadlines and remaining clock tighten without changing strength', () => {
  expect(budget(1)).toBe(1_000);
  expect(budget(10)).toBe(1_000);
  expect(budget(11)).toBe(1_500);
  expect(budget(15)).toBe(1_500);
  expect(budget(16)).toBe(2_000);
  expect(budget(20, 6_000)).toBe(200);
  expect(budget(20, 0)).toBe(1);
  expect(getBotDifficultyProfile(6)).toMatchObject({ useEngine: true, engineDepth: 14, engineMultiPv: 3 });
});

test('deduct elapsed clock and leave non-live games unchanged', () => {
  const input = { fen: initialFen, tempo: 'live', liveTimeControl: '1m',
    clockMs: 30_000, lastMoveAt: new Date(10_000).toISOString(), nowMs: 13_000 };
  expect(botMoveBudgetMs(input)).toBe(900);
  expect(botMoveBudgetMs({ ...input, tempo: 'daily' })).toBeNull();
});

test('real production ASM engine completes 50 legal deadline-bounded turns', async ({}, testInfo) => {
  test.setTimeout(120_000);
  test.skip(process.env.PLAY_COMPUTER_REAL_ENGINE !== '1', 'Explicit real-engine measurement');
  const board = new Chess();
  board.move('c4');
  const results: Array<{ move: number; elapsedMs: number; engine: boolean; failure?: string }> = [];
  for (let index = 0; index < 50; index += 1) {
    if (index === 40) board.load('8/8/3k4/8/3K4/8/4P3/8 w - - 0 40');
    if (board.isGameOver()) board.reset();
    const fen = board.fen();
    const move = Number(fen.split(' ')[5]);
    const cap = budget(move)!;
    const start = performance.now();
    let failure: string | undefined;
    const lines = await buildBotCandidatesFromFen(fen, getBotDifficultyProfile(6), {
      deadlineMs: start + cap,
      onEngineFailure: (error) => { failure = String(error); },
    });
    const elapsedMs = performance.now() - start;
    const line = lines[0];
    expect(line).toBeTruthy();
    expect(elapsedMs).toBeLessThan(cap + 50);
    results.push({ move, elapsedMs: Math.round(elapsedMs), engine: line.source === 'engine', failure });
    board.move({ from: line.move.slice(0, 2), to: line.move.slice(2, 4), promotion: line.move[4] });
  }
  console.log('REAL_ENGINE_MEASUREMENT', JSON.stringify(results));
  await testInfo.attach('real-stockfish-deadline-measurement.json', {
    body: JSON.stringify(results, null, 2), contentType: 'application/json',
  });
  const fallbacks = results.filter((row) => !row.engine).length;
  expect(fallbacks / results.length, 'Stop if normal fallback rate exceeds 20%').toBeLessThanOrEqual(0.2);
});
