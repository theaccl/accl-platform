import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { remainingConfiguredBotThinkTimeMs } from '@/lib/server/submitMoveBotGameCommit';

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
    const reservationIndex = src.indexOf('const reservationParams = buildBotTurnReservationRpcParams({');
    const candidateIndex = src.indexOf('const candidates = await buildBotCandidatesFromFen');
    const waitIndex = src.indexOf('await new Promise<void>');

    expect(reservationIndex).toBeGreaterThan(-1);
    expect(candidateIndex).toBeGreaterThan(reservationIndex);
    expect(waitIndex).toBeGreaterThan(candidateIndex);
  });

  test('moves the final clock decision into the authoritative queued-turn transaction', () => {
    const src = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '20260902120000_bot_turn_durable_clock_authority.sql'),
      'utf8',
    );
    const lockIndex = src.indexOf('where id = j.game_id\n  for update;');
    const expiryIndex = src.indexOf('v_flagged := public.bot_turn_flagged_loser(');
    const finishIndex = src.indexOf("g := public.finish_game_system(j.game_id, v_timeout_result, 'timeout');");
    const applyIndex = src.indexOf('g := public.apply_bot_game_turn_system(', expiryIndex);

    expect(lockIndex).toBeGreaterThan(-1);
    expect(expiryIndex).toBeGreaterThan(-1);
    expect(finishIndex).toBeGreaterThan(expiryIndex);
    expect(applyIndex).toBeGreaterThan(finishIndex);
    expect(src).toContain("last_error = 'bot_clock_expired'");
  });
});
