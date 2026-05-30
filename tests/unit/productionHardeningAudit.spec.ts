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
    const notation = src('components/game/GameNotationStrip.tsx');
    expect(page).toContain("classList.add('accl-game-route')");
    expect(page).toContain('accl-game-board-stage');
    expect(page).toContain('accl-game-board-canvas');
    expect(page).toContain('accl-scroll-no-anchor');
    expect(page).toContain('GameNotationStrip');
    expect(page).toContain('accl-game-play-column');
    expect(page).toContain('accl-game-notation-slot');
    expect(page).toContain('accl-game-active-hud');
    expect(page).toContain('data-testid="game-active-hud"');
    // Player identity renders beside the clocks (white name with white clock,
    // black name with black clock) without wrapping or jumping the board.
    expect(page).toContain('data-testid="clock-white-name"');
    expect(page).toContain('data-testid="clock-black-name"');
    expect(page).toContain('whiteName={whiteActiveLabel}');
    expect(page).toContain('blackName={blackActiveLabel}');
    expect(page).toContain("whiteSpace: 'nowrap'");
    expect(page).toContain("textOverflow: 'ellipsis'");
    expect(page).toContain('accl-game-preamble');
    expect(page).toContain('accl-game-shell-tail');
    // Board-first stage wraps the play column + the chat rail (siblings) so chat
    // growth lives in its own track and never moves the board.
    expect(page).toContain('accl-game-stage');
    expect(page).toContain('data-testid="game-stage"');
    expect(page).toContain('accl-game-stage-row');
    expect(page).toContain('accl-game-chat-sheet');
    expect(page).toContain('data-testid="game-chat-region"');
    // Essential active-game actions live in a compact console row below the board.
    expect(page).toContain('accl-game-actions');
    expect(page).toContain('data-testid="game-actions"');
    // Human chat is suppressed for Play Computer (bot) games — no empty rail.
    expect(page).toContain("game.source_type !== 'bot_game'");
    // Chat toggle label: active/waiting => "Game chat"; finished => "Game chat history".
    expect(page).toContain("game.status === 'finished' ? 'Game chat history' : 'Game chat'");
    expect(page).toContain("chatOpen ? '▴' : '▾'");
    // Secondary metadata collapses behind a disclosure during play.
    expect(page).toContain('accl-game-details');
    expect(page).toContain('Game details');
    expect(notation).toContain('data-testid="game-notation-strip"');
    expect(notation).toContain('Moves will appear here.');
    expect(page).toContain('data-testid="game-replay-panel"');
    expect(page).toContain("minHeight: '100dvh'");
    const boardIdx = page.indexOf('game-board-with-tournament-rail');
    const notationIdx = page.indexOf('accl-game-notation-slot');
    const replayIdx = page.indexOf('game-replay-panel');
    const hudIdx = page.indexOf('accl-game-active-hud');
    const playIdx = page.indexOf('accl-game-play-column');
    expect(boardIdx).toBeGreaterThan(-1);
    expect(notationIdx).toBeGreaterThan(-1);
    expect(replayIdx).toBeGreaterThan(-1);
    expect(hudIdx).toBeGreaterThan(playIdx);
    expect(hudIdx).toBeLessThan(notationIdx);
    expect(notationIdx).toBeLessThan(boardIdx);
    expect(replayIdx).toBeGreaterThan(boardIdx);
    const clockInHudIdx = page.indexOf('accl-game-clock--play-hud', hudIdx);
    expect(clockInHudIdx).toBeGreaterThan(hudIdx);
    expect(clockInHudIdx).toBeLessThan(notationIdx);
    expect(css).toContain('html.accl-game-route');
    expect(css).toContain('scrollbar-gutter: stable');
    expect(css).toContain('.accl-game-board-canvas');
    expect(css).toContain('.accl-game-notation-slot');
    expect(css).toContain('.accl-game-play-column');
    expect(css).toContain('.accl-game-active-hud');
    expect(css).toContain('@media (max-width: 768px)');
    // Board-first shell + desktop board/chat row + clock digit stability.
    expect(css).toContain('.accl-game-stage');
    expect(css).toContain('.accl-game-stage-row');
    expect(css).toContain('.accl-game-actions');
    expect(css).toContain('.accl-game-chat-sheet');
    expect(css).toContain('@media (min-width: 960px)');
    expect(css).toContain('font-variant-numeric: tabular-nums');
    expect(css).not.toContain('contain: layout size style');
    expect(css).toContain('overflow-anchor: none');
    const chat = src('components/game/GameTesterChatPanels.tsx');
    expect(chat).toContain('accl-scroll-no-anchor');
  });

  test('game details disclosure encloses secondary metadata, keeps operational/E2E nodes outside', () => {
    const page = src('app/game/[id]/page.tsx');
    const detailsOpen = page.indexOf('data-testid="game-details"');
    const detailsClose = page.indexOf('</details>', detailsOpen);
    expect(detailsOpen, 'game-details disclosure must exist').toBeGreaterThan(-1);
    expect(detailsClose, 'game-details disclosure must close').toBeGreaterThan(detailsOpen);

    // Secondary metadata must live INSIDE the disclosure so a collapsed console
    // (player + spectator) never re-exposes redundant ID/Status/seat/turn text.
    for (const marker of [
      'data-testid="game-row-id"',
      'data-testid="game-row-status"',
      'data-testid="game-player-name-white"',
      'data-testid="game-player-name-black"',
      '<strong>You are:</strong>',
      '<strong>Turn:</strong>',
      'data-testid="game-spectator-guest-hint"',
    ]) {
      const idx = page.indexOf(marker);
      expect(idx, `${marker} must render inside game-details`).toBeGreaterThan(detailsOpen);
      expect(idx, `${marker} must render inside game-details`).toBeLessThan(detailsClose);
    }

    // The hidden E2E startup snapshot and immediate-attention operational nodes must
    // stay OUTSIDE the disclosure so automation + banners are never toggled off.
    for (const marker of [
      'data-testid="game-startup-snapshot"',
      'data-testid="game-active-hud"',
      'data-testid="game-actions"',
    ]) {
      const idx = page.indexOf(marker);
      expect(idx, `${marker} must render outside (after) game-details`).toBeGreaterThan(detailsClose);
    }
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
