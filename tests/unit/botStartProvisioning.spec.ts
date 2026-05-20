import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  playComputerBotEnvFailures,
  playComputerMissingProfileBody,
  playComputerProvisioningErrorBody,
} from '@/lib/bot/botStartProvisioning';

test.describe('Play Computer bot start provisioning (static)', () => {
  test('start route uses sync env gate only, not async all-bot auth audit', () => {
    const src = readFileSync(
      join(process.cwd(), 'app', 'api', 'bot', 'game', 'start', 'route.ts'),
      'utf8',
    );
    expect(src).toContain('playComputerBotEnvFailures');
    expect(src).not.toContain('getRuntimeConfigValidationReport');
  });

  test('bot game insert writes bot_settings on create', () => {
    const src = readFileSync(join(process.cwd(), 'lib', 'gameStartupInsert.ts'), 'utf8');
    expect(src).toContain('encodeBotGameConfigRow');
    expect(src).toContain("source_type: 'bot_game'");
  });

  test('personality style maps to bot profile seat', () => {
    const src = readFileSync(join(process.cwd(), 'lib', 'bot', 'botIdentity.ts'), 'utf8');
    expect(src).toContain("case 'aggressive'");
    expect(src).toContain("return 'Aggro Bot'");
    expect(src).toContain("return 'Endgame Bot'");
    expect(src).toContain("return 'Cardi Bot'");
  });
});

test.describe('playComputerBotEnvFailures (sync)', () => {
  test('returns empty when bot env unset (optional defaults)', () => {
    const prev = {
      cardi: process.env.BOT_USER_ID_CARDI,
      aggro: process.env.BOT_USER_ID_AGGRO,
      endgame: process.env.BOT_USER_ID_ENDGAME,
    };
    delete process.env.BOT_USER_ID_CARDI;
    delete process.env.BOT_USER_ID_AGGRO;
    delete process.env.BOT_USER_ID_ENDGAME;
    try {
      expect(playComputerBotEnvFailures()).toEqual([]);
    } finally {
      if (prev.cardi) process.env.BOT_USER_ID_CARDI = prev.cardi;
      if (prev.aggro) process.env.BOT_USER_ID_AGGRO = prev.aggro;
      if (prev.endgame) process.env.BOT_USER_ID_ENDGAME = prev.endgame;
    }
  });
});

test.describe('provisioning error payloads', () => {
  test('stable Bot provisioning invalid envelope', () => {
    const body = playComputerProvisioningErrorBody([
      { key: 'BOT_IDENTITY_SET', ok: false, category: 'mismatched_bot_identity', detail: 'partial' },
    ]);
    expect(body.error).toBe('Bot provisioning invalid');
    expect(body.key).toBe('BOT_IDENTITY_SET');
  });

  test('missing profile uses same error anchor', () => {
    const body = playComputerMissingProfileBody('Cardi Bot', 'uuid');
    expect(body.error).toBe('Bot provisioning invalid');
    expect(body.category).toBe('missing_profile');
  });
});
