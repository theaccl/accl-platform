import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test.describe('chat API surface (static)', () => {
  test('routes require auth and delegate to shared handlers', () => {
    const root = join(process.cwd(), 'app', 'api', 'chat');
    const send = readFileSync(join(root, 'send', 'route.ts'), 'utf8');
    const messages = readFileSync(join(root, 'messages', 'route.ts'), 'utf8');
    expect(send).toContain('resolveAuthenticatedUserId');
    expect(send).toContain('401');
    expect(messages).toContain('resolveAuthenticatedUserId');
    expect(messages).toContain('401');
  });

  test('rate limiting is applied on send path', () => {
    const lib = readFileSync(join(process.cwd(), 'lib', 'chat', 'handleChatSend.ts'), 'utf8');
    expect(lib).toContain('checkRateLimit');
  });

  test('moderator export route is moderator-gated', () => {
    const mod = readFileSync(
      join(process.cwd(), 'app', 'api', 'moderator', 'chat', 'messages', 'route.ts'),
      'utf8'
    );
    expect(mod).toContain('requireModerator');
  });
});
