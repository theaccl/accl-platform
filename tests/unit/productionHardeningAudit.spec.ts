import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

function src(rel: string): string {
  return readFileSync(join(root, ...rel.split('/')), 'utf8');
}

test.describe('production hardening audit (static)', () => {
  test('growth-event route wraps handler in top-level try/catch', () => {
    const s = src('app/api/public/growth-event/route.ts');
    expect(s).toContain("console.error('[api/public/growth-event]");
    expect(s).toContain('createServiceRoleClient');
    expect(s).toMatch(/catch\s*\(\s*e\s*\)/);
  });

  test('attach-growth-profile route wraps handler in top-level try/catch', () => {
    const s = src('app/api/public/attach-growth-profile/route.ts');
    expect(s).toContain("console.error('[api/public/attach-growth-profile]");
    expect(s).toContain('createServiceRoleClient');
    expect(s).toMatch(/catch\s*\(\s*e\s*\)/);
  });

  test('trainer analyze route has outer POST try/catch and engine availability envelope', () => {
    const s = src('app/api/trainer/analyze-position/route.ts');
    expect(s).toContain("console.error('[api/trainer/analyze-position] unhandled'");
    expect(s).toContain('availability');
    expect(s).toContain("'ENGINE_ERROR'");
  });

  test('requests inbox uses actionInFlightRef to block duplicate submits', () => {
    const s = src('app/requests/page.tsx');
    expect(s).toContain('actionInFlightRef');
    expect(s).toContain('Declining…');
  });

  test('game board exposes interaction mode for QA / E2E', () => {
    const s = src('app/game/[id]/page.tsx');
    expect(s).toContain('boardInteractionMode');
    expect(s).toContain('data-interaction-mode={boardInteractionMode}');
  });

  test('game route stabilizes viewport and board stage against layout jitter', () => {
    const page = src('app/game/[id]/page.tsx');
    const css = src('app/globals.css');
    expect(page).toContain("classList.add('accl-game-route')");
    expect(page).toContain('accl-game-board-stage');
    expect(page).toContain('accl-game-board-canvas');
    expect(page).toContain('accl-scroll-no-anchor');
    expect(page).toContain('data-testid="game-notation-strip"');
    expect(page).toContain('accl-game-notation-strip');
    expect(page).toContain('Moves will appear here.');
    expect(page).toContain('data-testid="game-replay-panel"');
    expect(page).toContain("minHeight: '100dvh'");
    const boardIdx = page.indexOf('game-board-with-tournament-rail');
    const notationIdx = page.indexOf('game-notation-strip');
    const replayIdx = page.indexOf('game-replay-panel');
    expect(boardIdx).toBeGreaterThan(-1);
    expect(notationIdx).toBeGreaterThan(-1);
    expect(replayIdx).toBeGreaterThan(-1);
    expect(notationIdx).toBeLessThan(boardIdx);
    expect(replayIdx).toBeGreaterThan(boardIdx);
    expect(css).toContain('html.accl-game-route');
    expect(css).toContain('scrollbar-gutter: stable');
    expect(css).toContain('.accl-game-board-canvas');
    expect(css).toContain('.accl-game-notation-strip');
    expect(css).not.toContain('contain: layout size style');
    expect(css).toContain('overflow-anchor: none');
    const chat = src('components/game/GameTesterChatPanels.tsx');
    expect(chat).toContain('accl-scroll-no-anchor');
  });

  test('tester chat uses send locks and max body length', () => {
    const s = src('components/game/GameTesterChatPanels.tsx');
    expect(s).toContain('CHAT_BODY_MAX');
    expect(s).toContain('sendLock');
    expect(s).toContain('sendLock.current');
    expect(s).toContain('PGRST205');
    expect(s).toContain('game-chat-send-');
  });

  test('runtime bot env optional when all three unset', () => {
    const s = src('lib/runtimeConfigValidation.ts');
    expect(s).toContain('optional — no BOT_USER_ID_* set');
    expect(s).toContain('botsFullyConfigured');
  });

  test('funnel growth flush logs batch rejection at most once until success', () => {
    const s = src('lib/public/funnelTracking.ts');
    expect(s).toContain('growthBatchRejectedLogged');
    expect(s).toContain('growthFunnelSuspended');
    expect(s).toContain('!res.ok');
  });
});
