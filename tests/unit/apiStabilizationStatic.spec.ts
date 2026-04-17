import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test.describe('API stabilization (static source checks)', () => {
  test('submit-move does not expose db_error in conflict JSON', () => {
    const p = join(process.cwd(), 'app', 'api', 'game', 'submit-move', 'route.ts');
    const src = readFileSync(p, 'utf8');
    expect(src).not.toContain('db_error');
    expect(src).toContain('game_unavailable');
    expect(src).toContain('apply_move_and_maybe_finish_system');
    expect(src).toContain('finish_game_system');
    expect(src).toContain('botTerminal');
    expect(src).toContain("error: 'invalid_move'");
    expect(src).toContain("result: 'out_of_turn'");
  });

  test('bot game start does not return raw Postgres message on insert failure', () => {
    const p = join(process.cwd(), 'app', 'api', 'bot', 'game', 'start', 'route.ts');
    const src = readFileSync(p, 'utf8');
    expect(src).toContain('game_create_failed');
    expect(src).not.toMatch(/return json\(\{ error: error\.message \}/);
  });

  test('chat messages GET handler applies rate limiting', () => {
    const p = join(process.cwd(), 'lib', 'chat', 'handleChatMessages.ts');
    const src = readFileSync(p, 'utf8');
    expect(src).toContain('checkRateLimit');
    expect(src).toContain('chat:messages:get:');
  });

  test('DM threads route applies rate limits to GET and POST', () => {
    const p = join(process.cwd(), 'app', 'api', 'chat', 'dm', 'threads', 'route.ts');
    const src = readFileSync(p, 'utf8');
    expect(src).toContain('dm:thread:list:');
    expect(src).toContain('dm:thread:create:');
  });

  test('chat report mute block routes import rate limit', () => {
    for (const f of ['report', 'mute', 'block']) {
      const p = join(process.cwd(), 'app', 'api', 'chat', f, 'route.ts');
      const src = readFileSync(p, 'utf8');
      expect(src).toContain('checkRateLimit');
    }
  });

  test('GameTesterChatPanels guards against double send', () => {
    const p = join(process.cwd(), 'components', 'game', 'GameTesterChatPanels.tsx');
    const src = readFileSync(p, 'utf8');
    expect(src).toContain('specSending');
    expect(src).toContain('playSending');
    expect(src).toContain('formatChatSendError');
  });
});
