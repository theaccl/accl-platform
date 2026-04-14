import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test.describe('chat UI identity (static — no email display)', () => {
  test('GameTesterChatPanels uses profile identity helper for senders', () => {
    const p = join(process.cwd(), 'components', 'game', 'GameTesterChatPanels.tsx');
    const src = readFileSync(p, 'utf8');
    expect(src).toContain('publicDisplayNameFromProfileUsername');
    expect(src).not.toMatch(/sender_username\?\.trim\(\)\s*\|\|\s*m\.sender_id/);
  });
});
