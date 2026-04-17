import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, ...rel.split('/')), 'utf8');

test.describe('production smoke / freeze (static contracts)', () => {
  test('/api/health returns JSON with ok and service metadata', () => {
    const s = read('app/api/health/route.ts');
    expect(s).toContain('NextResponse.json');
    expect(s).toContain('ok: true');
    expect(s).toContain('service:');
    expect(s).toContain('ts:');
  });

  test('/api/health/system returns structured checks + ok', () => {
    const s = read('app/api/health/system/route.ts');
    expect(s).toContain('SystemHealthBody');
    expect(s).toContain('checks:');
    expect(s).toContain('chat_table');
    expect(s).toContain('ok: !chatErr && !gameErr && !profileErr');
  });

  test('/api/health/db returns checks map + ok', () => {
    const s = read('app/api/health/db/route.ts');
    expect(s).toContain('checks');
    expect(s).toContain('tester_chat_messages');
    expect(s).toContain('return json({ ok, checks }');
  });

  test('growth-event only emits structured bodies (ok field on responses)', () => {
    const s = read('app/api/public/growth-event/route.ts');
    expect(s).toContain('ok: false');
    expect(s).toContain('ok: true');
    expect(s).toContain('availability');
    expect(s).toContain('JSON.stringify');
  });

  test('attach-growth-profile only emits structured bodies', () => {
    const s = read('app/api/public/attach-growth-profile/route.ts');
    expect(s).toContain('ok: false');
    expect(s).toContain('ok: true');
    expect(s).toContain('availability');
  });

  test('trainer analyze-position only emits structured bodies', () => {
    const s = read('app/api/trainer/analyze-position/route.ts');
    expect(s).toContain('ok: false');
    expect(s).toContain('ok: true');
    expect(s).toContain('availability');
    expect(s).toContain('RATE_LIMIT');
  });

  test('requests inbox guards duplicate in-flight actions', () => {
    const s = read('app/requests/page.tsx');
    expect(s).toContain('actionInFlightRef');
  });

  test('growth funnel backs off after non-429 failure', () => {
    const s = read('lib/public/funnelTracking.ts');
    expect(s).toContain('growthFunnelSuspended');
    expect(s).toContain('res.status !== 429');
  });
});
