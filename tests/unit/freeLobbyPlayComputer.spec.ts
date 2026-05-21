import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  COMPUTER_PLAY_PLAT_MODES,
  allComputerPlayTimeControlIds,
  isComputerPlayPlatMode,
  isValidComputerPlayTimeControl,
  resolveComputerPlayLiveTimeControl,
} from '@/lib/freePlayComputerEntry';
import { PLAT_MODE_TIME_OPTIONS } from '@/lib/freePlayModeTimeControl';

test.describe('Free lobby Play Computer entry (static)', () => {
  test('mode room files: bullet/blitz/rapid/daily routes share one page', () => {
    const src = readFileSync(join(process.cwd(), 'app', 'free', 'lobby', '[mode]', 'page.tsx'), 'utf8');
    expect(src).toContain('PLAT_MODE_ORDER');
    expect(src).toContain('FreeLobbyModeRoomContent');
  });

  test('Play Computer panel only when isComputerPlayPlatMode', () => {
    const src = readFileSync(
      join(process.cwd(), 'components', 'free', 'FreeLobbyModeRoomContent.tsx'),
      'utf8',
    );
    expect(src).toContain('platModeExposesComputerPlay');
    expect(src).toContain('showPlayComputer');
    expect(src).toContain('FreeLobbyPlayComputerPanel');
    expect(src).not.toContain('isComputerPlayPlatMode(');
    expect(src).toContain('free-lobby-mode-room-${mode}');
  });

  test('Daily mode room does not render Play Computer panel', () => {
    const roomSrc = readFileSync(
      join(process.cwd(), 'components', 'free', 'FreeLobbyModeRoomContent.tsx'),
      'utf8',
    );
    const panelSrc = readFileSync(
      join(process.cwd(), 'components', 'free', 'FreeLobbyPlayComputerPanel.tsx'),
      'utf8',
    );
    expect(roomSrc).toContain('showPlayComputer');
    expect(panelSrc).toContain('free-lobby-play-computer-panel');
    expect(panelSrc).not.toContain("'daily'");
    expect(COMPUTER_PLAY_PLAT_MODES).not.toContain('daily' as (typeof COMPUTER_PLAY_PLAT_MODES)[number]);
  });

  test('live mode rooms expose Play Computer test ids', () => {
    const panelSrc = readFileSync(
      join(process.cwd(), 'components', 'free', 'FreeLobbyPlayComputerPanel.tsx'),
      'utf8',
    );
    expect(panelSrc).toContain('free-lobby-play-computer-panel');
    expect(panelSrc).toContain('data-play-computer-mode={mode}');
    expect(panelSrc).toContain('free-lobby-play-computer-start-${mode}');
    expect(panelSrc).toContain('free-lobby-play-computer-tc-${mode}-${opt.id}');
  });

  test('bot start route reuses /api/bot/game/start with platMode validation', () => {
    const src = readFileSync(join(process.cwd(), 'app', 'api', 'bot', 'game', 'start', 'route.ts'), 'utf8');
    expect(src).toContain('resolveComputerPlayLiveTimeControl');
    expect(src).toContain('botGameInsert');
    expect(src).not.toContain('BOT_MOVE_QUEUE_ENABLED');
    expect(src).not.toContain('bot-move-queue');
    expect(src).not.toContain('enqueue_bot_move_job');
    expect(src).not.toContain('getRuntimeConfigValidationReport');
    expect(src).toContain('playComputerBotEnvFailures');
  });

  test('no processor route added for computer lobby entry', () => {
    const panelSrc = readFileSync(
      join(process.cwd(), 'components', 'free', 'FreeLobbyPlayComputerPanel.tsx'),
      'utf8',
    );
    expect(panelSrc).toContain('/api/bot/game/start');
    expect(panelSrc).toContain('payload.detail');
    expect(panelSrc).not.toContain('/api/internal/bot-move');
  });

  test('bot games remain unrated on insert', () => {
    const src = readFileSync(join(process.cwd(), 'lib', 'gameStartupInsert.ts'), 'utf8');
    expect(src).toContain('rated: false');
    expect(src).toContain("source_type: 'bot_game'");
  });
});

test.describe('Free lobby Play Computer time controls (unit)', () => {
  test('bullet allows bullet clocks only', () => {
    expect(isValidComputerPlayTimeControl('bullet', '1m')).toBe(true);
    expect(isValidComputerPlayTimeControl('bullet', '3m')).toBe(false);
    expect(isValidComputerPlayTimeControl('bullet', '1d')).toBe(false);
  });

  test('blitz allows blitz clocks only', () => {
    expect(isValidComputerPlayTimeControl('blitz', '5m')).toBe(true);
    expect(isValidComputerPlayTimeControl('blitz', '1m')).toBe(false);
  });

  test('rapid allows rapid clocks only', () => {
    expect(isValidComputerPlayTimeControl('rapid', '30m')).toBe(true);
    expect(isValidComputerPlayTimeControl('rapid', '5m')).toBe(false);
  });

  test('resolve rejects daily TC even without platMode', () => {
    expect(resolveComputerPlayLiveTimeControl({ platMode: null, liveTimeControl: '1d' }).ok).toBe(false);
  });

  test('resolve enforces platMode when provided', () => {
    expect(
      resolveComputerPlayLiveTimeControl({ platMode: 'bullet', liveTimeControl: '10m' }).ok,
    ).toBe(false);
    expect(
      resolveComputerPlayLiveTimeControl({ platMode: 'bullet', liveTimeControl: '1+1' }).ok,
    ).toBe(true);
  });

  test('all computer clocks are union of bullet/blitz/rapid options', () => {
    const ids = allComputerPlayTimeControlIds();
    for (const mode of COMPUTER_PLAY_PLAT_MODES) {
      for (const o of PLAT_MODE_TIME_OPTIONS[mode]) {
        expect(ids.has(o.id)).toBe(true);
      }
    }
    expect(isComputerPlayPlatMode('daily')).toBe(false);
  });
});
