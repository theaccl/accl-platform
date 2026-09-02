import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { botPlayAgainRequestFromGame } from '@/lib/bot/botPlayAgain';

test.describe('finished bot game Play Again', () => {
  test('reuses the persisted difficulty, personality, and clock', () => {
    expect(
      botPlayAgainRequestFromGame({
        source_type: 'bot_game',
        bot_settings: {
          version: 'accl_bot_v1',
          difficulty: 5,
          personalityStyle: 'aggressive',
          opponentLabel: 'Aggressive',
        },
        live_time_control: '5+5',
      }),
    ).toEqual({
      difficulty: 5,
      personalityStyle: 'aggressive',
      liveTimeControl: '5+5',
      platMode: 'blitz',
    });
  });

  test('supports an older bot game with no clock', () => {
    expect(
      botPlayAgainRequestFromGame({
        source_type: 'bot_game',
        rating_last_update: {
          accl_bot_v1: {
            difficulty: 3,
            personalityStyle: 'balanced',
            opponentLabel: 'Computer',
          },
        },
        live_time_control: null,
      }),
    ).toEqual({
      difficulty: 3,
      personalityStyle: 'balanced',
      liveTimeControl: null,
      platMode: null,
    });
  });

  test('preserves an allowed hidden legacy rapid clock instead of silently downgrading it', () => {
    expect(
      botPlayAgainRequestFromGame({
        source_type: 'bot_game',
        bot_settings: {
          version: 'accl_bot_v1',
          difficulty: 4,
          personalityStyle: 'defensive',
          opponentLabel: 'Defensive',
        },
        live_time_control: '20m',
      }),
    ).toMatchObject({ liveTimeControl: '20m', platMode: 'rapid' });
  });

  test('rejects an unrecognized stored clock instead of silently changing it', () => {
    expect(
      botPlayAgainRequestFromGame({
        source_type: 'bot_game',
        bot_settings: {
          version: 'accl_bot_v1',
          difficulty: 4,
          personalityStyle: 'defensive',
          opponentLabel: 'Defensive',
        },
        live_time_control: 'not-a-clock',
      }),
    ).toBeNull();
  });

  test('rejects human games and malformed bot settings', () => {
    expect(
      botPlayAgainRequestFromGame({
        source_type: 'challenge',
        bot_settings: {
          version: 'accl_bot_v1',
          difficulty: 5,
          personalityStyle: 'aggressive',
        },
        live_time_control: '5m',
      }),
    ).toBeNull();
    expect(botPlayAgainRequestFromGame({ source_type: 'bot_game' })).toBeNull();
  });

  test('game page uses direct bot start while preserving human rematches', () => {
    const src = readFileSync(
      join(process.cwd(), 'app', 'game', '[id]', 'page.tsx'),
      'utf8',
    );

    expect(src).toContain('data-testid="bot-play-again-button"');
    expect(src).toContain("postAuthenticatedJson(supabase, '/api/bot/game/start', request)");
    expect(src).toContain("game.source_type === 'bot_game'");
    expect(src).toContain("game.source_type !== 'bot_game'");
    expect(src).toContain("'/api/match-requests/create-rematch'");
    expect(src).toContain(
      'Could not start another computer game. Check your connection and try again.',
    );
  });
});
