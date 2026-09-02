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
});
