import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const gamePagePath = join(process.cwd(), 'app', 'game', '[id]', 'page.tsx');

test.describe('game page tester chat surface', () => {
  test('chat panels only mount for authenticated viewers (not public spectator)', () => {
    const src = readFileSync(gamePagePath, 'utf8');
    expect(src).toContain('GameTesterChatPanels');
    expect(src).toContain('!isPublicViewer && game');
    expect(src).toContain('chatAccessToken');
  });

  test('signed-in users see bug report trigger before tester chat', () => {
    const src = readFileSync(gamePagePath, 'utf8');
    const bugIdx = src.indexOf('TesterBugReportTrigger');
    const chatIdx = src.indexOf('<GameTesterChatPanels');
    expect(bugIdx).toBeGreaterThan(-1);
    expect(chatIdx).toBeGreaterThan(bugIdx);
  });

  test('anonymous users have no chat inputs (component not mounted when public viewer)', () => {
    const src = readFileSync(gamePagePath, 'utf8');
    expect(src).toContain('!isPublicViewer && game ? (');
    expect(src).toContain('<GameTesterChatPanels');
    const guardIdx = src.indexOf('!isPublicViewer && game ? (');
    const compIdx = src.indexOf('<GameTesterChatPanels');
    expect(compIdx).toBeGreaterThan(guardIdx);
  });
});
