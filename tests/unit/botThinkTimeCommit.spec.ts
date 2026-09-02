import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  authoritativeTurnClockRemainingMs,
  remainingConfiguredBotThinkTimeMs,
} from '@/lib/server/submitMoveBotGameCommit';

test.describe('authoritative bot think time', () => {
  test('waits only for the unused portion of the configured window', () => {
    const movedAt = '2026-09-02T12:00:00.000Z';
    const now = Date.parse('2026-09-02T12:00:00.700Z');

    expect(remainingConfiguredBotThinkTimeMs(1_300, movedAt, now)).toBe(600);
    expect(remainingConfiguredBotThinkTimeMs(1_300, movedAt, now + 1_000)).toBe(0);
  });

  test('uses the full bounded delay when no authoritative timestamp exists', () => {
    expect(remainingConfiguredBotThinkTimeMs(1_300, null, 0)).toBe(1_300);
    expect(remainingConfiguredBotThinkTimeMs(-20, null, 0)).toBe(0);
  });

  test('waits before building the authoritative bot clock patch', () => {
    const src = readFileSync(
      join(process.cwd(), 'lib', 'server', 'submitMoveBotGameCommit.ts'),
      'utf8',
    );
    const waitIndex = src.indexOf('await new Promise<void>');
    const patchIndex = src.indexOf('botPatch = buildAuthoritativeMovePatch({');

    expect(waitIndex).toBeGreaterThan(-1);
    expect(patchIndex).toBeGreaterThan(waitIndex);
    expect(src).toContain('postHumanRow.last_move_at');
  });

  test('publishes the human ply before engine work and configured waiting', () => {
    const src = readFileSync(
      join(process.cwd(), 'lib', 'server', 'submitMoveBotGameCommit.ts'),
      'utf8',
    );
    const reservationIndex = src.indexOf('const reservationParams = buildBotGameTurnRpcParams({');
    const candidateIndex = src.indexOf('const candidates = await buildBotCandidatesFromFen');
    const waitIndex = src.indexOf('await new Promise<void>');

    expect(reservationIndex).toBeGreaterThan(-1);
    expect(candidateIndex).toBeGreaterThan(reservationIndex);
    expect(waitIndex).toBeGreaterThan(candidateIndex);
  });

  test('computes the bot clock from the reserved authoritative turn', () => {
    const movedAt = '2026-09-02T12:00:00.000Z';
    const row = {
      tempo: 'live',
      live_time_control: '5+3',
      turn: 'black',
      last_move_at: movedAt,
      white_clock_ms: 12_000,
      black_clock_ms: 900,
    };

    expect(
      authoritativeTurnClockRemainingMs(row, Date.parse('2026-09-02T12:00:00.700Z')),
    ).toBe(200);
    expect(
      authoritativeTurnClockRemainingMs(row, Date.parse('2026-09-02T12:00:01.000Z')),
    ).toBe(0);
  });

  test('does not treat a non-ticking game as a clock timeout', () => {
    expect(
      authoritativeTurnClockRemainingMs({ tempo: 'correspondence', turn: 'black' }, Date.now()),
    ).toBeNull();
  });

  test('finishes an expired bot turn before building or committing its move', () => {
    const src = readFileSync(
      join(process.cwd(), 'lib', 'server', 'submitMoveBotGameCommit.ts'),
      'utf8',
    );
    const expiryIndex = src.indexOf('const botClockRemainingMs');
    const finishIndex = src.indexOf("await supabase.rpc('finish_game_system'");
    const patchIndex = src.indexOf('botPatch = buildAuthoritativeMovePatch({');

    expect(expiryIndex).toBeGreaterThan(-1);
    expect(finishIndex).toBeGreaterThan(expiryIndex);
    expect(patchIndex).toBeGreaterThan(finishIndex);
    expect(src).toContain("p_end_reason: 'timeout'");
  });
});
