import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test.describe('Lobby Chat entry (static)', () => {
  test('/free redirects signed-in users to /free/lobby', () => {
    const src = readFileSync(join(process.cwd(), 'app', 'free', 'page.tsx'), 'utf8');
    expect(src).toContain("redirect('/free/lobby')");
    expect(src).toContain('getSupabaseUserFromCookies');
  });

  test('mode room route accepts bullet/blitz/rapid/daily segment', () => {
    const src = readFileSync(join(process.cwd(), 'app', 'free', 'lobby', '[mode]', 'page.tsx'), 'utf8');
    expect(src).toContain('PLAT_MODE_ORDER');
    expect(src).toContain('notFound()');
    expect(src).toContain('FreeLobbyModeRoomContent');
  });
});
