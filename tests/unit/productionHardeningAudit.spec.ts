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

  test('tester chat uses send locks and max body length', () => {
    const s = src('components/game/GameTesterChatPanels.tsx');
    expect(s).toContain('CHAT_BODY_MAX');
    expect(s).toContain('specSendLock');
    expect(s).toContain('playSendLock');
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
