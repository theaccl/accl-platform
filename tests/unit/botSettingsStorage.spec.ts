import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  botSettingsDocumentFromConfig,
  defaultBotGameConfig,
  encodeBotGameConfigRow,
  parseBotGameConfigFromGameRow,
  ratingLastUpdateContainsBotConfig,
} from '@/lib/bot/botGameConfig';
import { botGameInsert } from '@/lib/gameStartupInsert';

const HUMAN = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const BOT = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

test.describe('bot_settings storage (Phase 1H)', () => {
  test('encodeBotGameConfigRow writes bot_settings only', () => {
    const cfg = defaultBotGameConfig(3, 'balanced', 'Balanced Bot');
    const encoded = encodeBotGameConfigRow(cfg, {
      botProfileId: BOT,
      createdFrom: 'free_computer',
    });
    expect(encoded).toHaveProperty('bot_settings');
    expect(encoded).not.toHaveProperty('rating_last_update');
    expect(encoded.bot_settings.version).toBe('accl_bot_v1');
    expect(encoded.bot_settings.botProfileId).toBe(BOT);
    expect(encoded.bot_settings.createdFrom).toBe('free_computer');
  });

  test('botGameInsert includes bot_settings not rating_last_update', () => {
    const row = botGameInsert(HUMAN, BOT, {
      difficulty: 2,
      personalityStyle: 'aggressive',
      opponentLabel: 'Aggressive Bot',
    });
    expect(row.bot_settings).toBeTruthy();
    expect((row as { rating_last_update?: unknown }).rating_last_update).toBeUndefined();
    expect(row.bot_settings?.version).toBe('accl_bot_v1');
    expect(row.bot_settings?.difficulty).toBe(2);
    expect(row.bot_settings?.personalityStyle).toBe('aggressive');
  });

  test('parser prefers bot_settings over rating_last_update', () => {
    const cfg = defaultBotGameConfig(4, 'aggressive', 'From settings');
    const legacy = defaultBotGameConfig(1, 'defensive', 'From legacy');
    const parsed = parseBotGameConfigFromGameRow({
      source_type: 'bot_game',
      bot_settings: botSettingsDocumentFromConfig(cfg),
      rating_last_update: legacy,
    });
    expect(parsed?.accl_bot_v1.difficulty).toBe(4);
    expect(parsed?.accl_bot_v1.opponentLabel).toBe('From settings');
  });

  test('parser falls back to rating_last_update.accl_bot_v1', () => {
    const legacy = defaultBotGameConfig(5, 'endgame', 'Legacy Bot');
    const parsed = parseBotGameConfigFromGameRow({
      source_type: 'bot_game',
      bot_settings: null,
      rating_last_update: legacy,
    });
    expect(parsed?.accl_bot_v1.difficulty).toBe(5);
    expect(parsed?.accl_bot_v1.personalityStyle).toBe('endgame');
  });

  test('migration adds bot_settings column and backfill', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '20260531170000_games_bot_settings.sql'),
      'utf8',
    );
    expect(sql).toContain('add column if not exists bot_settings jsonb');
    expect(sql).toContain("g.source_type = 'bot_game'");
    expect(sql).toContain("rating_last_update ? 'accl_bot_v1'");
    expect(sql).not.toMatch(/delete\s+from\s+public\.games/i);
  });

  test('submit-move select includes bot_settings', () => {
    const src = readFileSync(
      join(process.cwd(), 'app', 'api', 'game', 'submit-move', 'route.ts'),
      'utf8',
    );
    expect(src).toContain('bot_settings');
    const commitSrc = readFileSync(
      join(process.cwd(), 'lib', 'server', 'submitMoveBotGameCommit.ts'),
      'utf8',
    );
    expect(commitSrc).toContain('bot_settings');
  });

  test('ratingLastUpdateContainsBotConfig detects legacy shape', () => {
    expect(ratingLastUpdateContainsBotConfig(defaultBotGameConfig(3, 'balanced', 'X'))).toBe(true);
    expect(ratingLastUpdateContainsBotConfig({ bucket: 'blitz' })).toBe(false);
    expect(ratingLastUpdateContainsBotConfig(null)).toBe(false);
  });
});
