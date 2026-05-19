import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PATHS = [
  join(process.cwd(), 'components', 'free', 'FreeLobbyCurrentGamesPanel.tsx'),
  join(process.cwd(), 'app', 'free', 'active', 'page.tsx'),
  join(process.cwd(), 'lib', 'nexus', 'nexusHubMapping.ts'),
  join(process.cwd(), 'app', 'game', '[id]', 'page.tsx'),
];

test.describe('live vs async continuity copy (static)', () => {
  test('surfaces do not use generic Review / Resume heading', () => {
    for (const path of PATHS) {
      const src = readFileSync(path, 'utf8');
      expect(src, path).not.toContain('Review / Resume');
    }
  });

  test('lobby panel exposes live and daily-async sections', () => {
    const src = readFileSync(PATHS[0], 'utf8');
    expect(src).toContain('free-lobby-live-now');
    expect(src).toContain('free-lobby-daily-async');
    expect(src).toContain('LIVE_NOW_SECTION_TITLE');
    expect(src).toContain('DAILY_ASYNC_SECTION_TITLE');
    expect(src).toContain('LIVE_NOW_SECTION_HINT');
  });

  test('nexus card is Your games', () => {
    const src = readFileSync(PATHS[2], 'utf8');
    expect(src).toContain('title: "Your games"');
    expect(src).not.toContain('title: "Resume game"');
  });
});
