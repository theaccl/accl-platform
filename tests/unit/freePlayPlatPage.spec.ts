import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const playPagePath = join(process.cwd(), 'app', 'free', 'play', 'page.tsx');
const panelPath = join(process.cwd(), 'components', 'FreePlayMatchPanel.tsx');
const findMatchLibPath = join(process.cwd(), 'lib', 'freePlayFindMatch.ts');

test.describe('/free/play PLAT wiring (static)', () => {
  test('page uses FreePlayMatchPanel and panel wires Find Match + mode chips', () => {
    const pageSrc = readFileSync(playPagePath, 'utf8');
    expect(pageSrc).toContain('FreePlayMatchPanel');
    expect(pageSrc).toContain('getSupabaseUserFromCookies');

    const panelSrc = readFileSync(panelPath, 'utf8');
    expect(panelSrc).toContain('free-find-match');
    expect(panelSrc).toContain('onClick');
    expect(panelSrc).toContain('findMatch');
    expect(panelSrc).toContain('free-plat-mode-');
    expect(panelSrc).toContain('runFreePlayFindMatch');
    expect(panelSrc).toContain('free-plat-selection-summary');
    expect(panelSrc).toContain('[free-play] findMatch threw');

    const libSrc = readFileSync(findMatchLibPath, 'utf8');
    expect(libSrc).toContain("from('games')");
    expect(libSrc).toContain(".eq('status', 'active')");
    expect(libSrc).toContain('createSeatedGameGuard');
  });
});
