import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const gamePagePath = join(process.cwd(), 'app', 'game', '[id]', 'page.tsx');
const chatPanelsPath = join(process.cwd(), 'components', 'game', 'GameTesterChatPanels.tsx');
const globalsCssPath = join(process.cwd(), 'app', 'globals.css');

test.describe('game page tester chat surface', () => {
  test('chat panels only mount for authenticated viewers (not public spectator)', () => {
    const src = readFileSync(gamePagePath, 'utf8');
    expect(src).toContain('GameTesterChatPanels');
    expect(src).toContain('!isPublicViewer && game');
    expect(src).toContain('chatAccessToken');
    expect(src).toContain('isBoardSpectator={isSpectator}');
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
    // Chat region (and its inputs) only mounts when chatViewerRole is not 'none'.
    expect(src).toContain("chatViewerRole !== 'none'");
    // chatViewerRole resolves to 'none' for unauthenticated viewers, so anonymous users never see chat.
    expect(src).toContain("if (!game || !userId) return 'none';");
    const guardIdx = src.indexOf("chatViewerRole !== 'none'");
    const compIdx = src.indexOf('<GameTesterChatPanels');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(compIdx).toBeGreaterThan(guardIdx);
  });
});

test.describe('finished-game player chat is a read-only archive', () => {
  test('postgame variant is rendered as read-only', () => {
    const src = readFileSync(chatPanelsPath, 'utf8');
    // The postgame lane variant flips the strip into archive (no composer) mode.
    expect(src).toContain("readOnly={variant === 'postgame'}");
  });

  test('read-only strip hides the composer and exposes an archive footer', () => {
    const src = readFileSync(chatPanelsPath, 'utf8');
    expect(src).toContain('readOnly = false');
    // Composer (textarea + send) is gated behind the non-readOnly branch.
    expect(src).toMatch(/readOnly \?\s*\(/);
    expect(src).toContain('game-chat-archive-footer');
    expect(src).toContain('game-chat-readonly-indicator');
    // Composer markup still exists for the active (non-readOnly) branch.
    expect(src).toContain('game-chat-send-${sendTestId}');
    expect(src).toContain('sendTestId="player"');
    expect(src).toContain('sendTestId="spectator"');
  });

  test('postgame send path is defensively rejected', () => {
    const src = readFileSync(chatPanelsPath, 'utf8');
    expect(src).toContain("if (variant === 'postgame') return;");
  });

  test('postgame archive subtitle describes a closed player-channel archive', () => {
    const src = readFileSync(chatPanelsPath, 'utf8');
    expect(src).toContain('Player channel archive after the game');
  });

  test('active (live/async) player lanes keep their composer', () => {
    const src = readFileSync(chatPanelsPath, 'utf8');
    // Live and async_play lanes never set readOnly, so the composer renders.
    expect(src).toContain("variant: 'live' | 'postgame' | 'async_play'");
    expect(src).toContain("variant={isLive ? 'live' : 'async_play'}");
  });
});

test.describe('active-game chat unread indicator light', () => {
  test('opponent realtime message raises the unread signal; own echo does not', () => {
    const src = readFileSync(chatPanelsPath, 'utf8');
    // Signal fires only when the sender is not the current user.
    expect(src).toContain('m.sender_id !== opts.currentUserId');
    expect(src).toContain('opts.onOpponentMessage()');
  });

  test('postgame archive never raises an unread signal', () => {
    const src = readFileSync(chatPanelsPath, 'utf8');
    expect(src).toContain("onOpponentMessage: variant === 'postgame' ? undefined : onOpponentMessageRef.current");
  });

  test('only the active table lane is wired to the unread callback', () => {
    const src = readFileSync(chatPanelsPath, 'utf8');
    const tableIdx = src.indexOf("key={`player-table-");
    const postIdx = src.indexOf("key={`player-post-");
    expect(tableIdx).toBeGreaterThan(-1);
    expect(postIdx).toBeGreaterThan(-1);
    // The callback is passed to the table lane block but not the postgame block.
    const tableBlock = src.slice(tableIdx, postIdx);
    expect(tableBlock).toContain('onOpponentMessage={onOpponentMessage}');
    expect(tableBlock).toContain('currentUserId={userId}');
    const postBlock = src.slice(postIdx);
    expect(postBlock).not.toContain('onOpponentMessage={onOpponentMessage}');
  });

  test('page lights the dot only when chat is not visibly open, and clears on open/rail', () => {
    const src = readFileSync(gamePagePath, 'utf8');
    expect(src).toContain('const [hasUnreadChat, setHasUnreadChat] = useState(false);');
    // Guarded set: not open AND rail not visible.
    expect(src).toContain('if (!chatOpenRef.current && !chatRailVisibleRef.current) setHasUnreadChat(true);');
    // Cleared as soon as chat is visible (sheet open or desktop rail), no reply required.
    expect(src).toContain('if (chatOpen || chatRailVisible) setHasUnreadChat(false);');
    // Desktop rail visibility tracked via the same 960px breakpoint used by the CSS.
    expect(src).toContain("window.matchMedia('(min-width: 960px)')");
  });

  test('unread light slot is reserved in the toggle and hidden when no unread', () => {
    const src = readFileSync(gamePagePath, 'utf8');
    expect(src).toContain('data-testid="game-chat-unread-light"');
    expect(src).toContain("data-unread={hasUnreadChat && !chatOpen ? '1' : '0'}");
    // Toggle label text remains intact alongside the light.
    expect(src).toContain('accl-game-chat__toggle-label');
  });

  test('unread light is suppressed for Play Computer (chat region gated by source_type)', () => {
    const src = readFileSync(gamePagePath, 'utf8');
    // The whole chat region (toggle + light) only renders for non-bot games.
    expect(src).toContain("game.source_type !== 'bot_game'");
    const gateIdx = src.indexOf("game.source_type !== 'bot_game'");
    const lightIdx = src.indexOf('data-testid="game-chat-unread-light"');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(lightIdx).toBeGreaterThan(gateIdx);
  });

  test('unread light slot is fixed-size and reserved (no layout shift on appear)', () => {
    const css = readFileSync(globalsCssPath, 'utf8');
    const block = css.slice(css.indexOf('.accl-game-chat__unread'));
    expect(block).toContain('flex: 0 0 8px');
    expect(block).toContain('width: 8px');
    expect(block).toContain('height: 8px');
    // Hidden (not removed) by default so the slot is always reserved.
    expect(block).toContain('visibility: hidden');
    expect(block).toContain("data-unread='1'");
  });
});
