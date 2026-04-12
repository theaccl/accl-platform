import { expect, test } from '@playwright/test';

import { GET as moderatorEnforcementGet } from '../../app/api/moderator/enforcement/[userId]/route';
import { POST as moderatorEnforcementOverridePost } from '../../app/api/moderator/enforcement/override/route';
import {
  InMemoryAntiCheatEnforcementStore,
  SupabaseAntiCheatEnforcementStore,
  type EnforcementState,
} from '../../lib/analysis';

function createFakeSupabaseForEnforcement() {
  const enforcementRows = new Map<string, Record<string, unknown>>();
  const overrideAuditRows: Record<string, unknown>[] = [];
  const from = (table: string) => {
    const state: Record<string, unknown> = { eq: {} };
    const api = {
      upsert: async (row: Record<string, unknown>) => {
        if (table === 'anti_cheat_enforcement_states') {
          enforcementRows.set(String(row.user_id ?? ''), {
            ...(enforcementRows.get(String(row.user_id ?? '')) ?? {}),
            ...row,
            created_at:
              (enforcementRows.get(String(row.user_id ?? ''))?.created_at as string | undefined) ??
              new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
        return { error: null };
      },
      insert: async (row: Record<string, unknown>) => {
        if (table === 'anti_cheat_enforcement_override_history') {
          overrideAuditRows.push({
            ...row,
            id: overrideAuditRows.length + 1,
            created_at: new Date().toISOString(),
          });
        }
        return { error: null };
      },
      select: (_columns: string) => api,
      eq: (k: string, v: unknown) => {
        (state.eq as Record<string, unknown>)[k] = v;
        return api;
      },
      maybeSingle: async () => {
        if (table === 'anti_cheat_enforcement_states') {
          const uid = String((state.eq as Record<string, unknown>).user_id ?? '');
          return { data: enforcementRows.get(uid) ?? null, error: null };
        }
        return { data: null, error: null };
      },
      then: undefined,
    };
    return api;
  };
  return {
    client: { from } as never,
    enforcementRows,
    overrideAuditRows,
  };
}

test.describe('Moderator enforcement override API/store', () => {
  test('override endpoint denies authenticated non-moderator and does not apply side effects', async () => {
    const originalFetch = globalThis.fetch;
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const originalService = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const fetchCalls: string[] = [];
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.test';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key';

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      fetchCalls.push(url);
      if (url.includes('/auth/v1/user')) {
        return new Response(
          JSON.stringify({
            id: '00000000-0000-0000-0000-00000000e110',
            app_metadata: { roles: ['member'] },
            user_metadata: {},
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      throw new Error(`Unexpected fetch during denial-path test: ${url}`);
    }) as typeof fetch;

    try {
      const response = await moderatorEnforcementOverridePost(
        new Request('https://example.test/api/moderator/enforcement/override', {
          method: 'POST',
          headers: { Authorization: 'Bearer non-moderator-token' },
          body: JSON.stringify({
            user_id: '00000000-0000-0000-0000-00000000e111',
            action: 'CLEAR_RESTRICTION',
            reason: 'attempted moderator override',
          }),
        })
      );
      expect(response.status).toBe(403);

      // Auth lookup should happen, but denial must short-circuit before any state/audit write path.
      expect(fetchCalls.some((url) => url.includes('/auth/v1/user'))).toBe(true);
      expect(fetchCalls.some((url) => url.includes('/rest/v1/anti_cheat_enforcement_states'))).toBe(false);
      expect(fetchCalls.some((url) => url.includes('/rest/v1/anti_cheat_enforcement_override_history'))).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnon;
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalService;
    }
  });

  test('effective state endpoint denies authenticated non-moderator', async () => {
    const originalFetch = globalThis.fetch;
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.test';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/auth/v1/user')) {
        return new Response(
          JSON.stringify({
            id: '00000000-0000-0000-0000-00000000e112',
            app_metadata: { roles: ['member'] },
            user_metadata: {},
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      throw new Error(`Unexpected fetch during denial-path test: ${url}`);
    }) as typeof fetch;

    try {
      const response = await moderatorEnforcementGet(
        new Request('https://example.test/api/moderator/enforcement/00000000-0000-0000-0000-00000000e113', {
          headers: { Authorization: 'Bearer non-moderator-token' },
        }),
        { params: Promise.resolve({ userId: '00000000-0000-0000-0000-00000000e113' }) }
      );
      expect(response.status).toBe(403);
    } finally {
      globalThis.fetch = originalFetch;
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnon;
    }
  });

  test('moderator override actions map to expected effective states', async () => {
    const store = new InMemoryAntiCheatEnforcementStore();
    const userId = '00000000-0000-0000-0000-00000000e101';
    const moderatorId = '00000000-0000-0000-0000-00000000e201';
    const cases: Array<{ action: 'CLEAR_RESTRICTION' | 'TEMPORARY_UNLOCK' | 'KEEP_LOCKED_PENDING_REVIEW'; expected: EnforcementState }> = [
      { action: 'CLEAR_RESTRICTION', expected: 'NO_RESTRICTION' },
      { action: 'TEMPORARY_UNLOCK', expected: 'MONITOR_ONLY' },
      { action: 'KEEP_LOCKED_PENDING_REVIEW', expected: 'REVIEW_LOCKED' },
    ];

    for (const tcase of cases) {
      await store.applyModeratorOverride({
        userId,
        moderatorId,
        action: tcase.action,
        reason: `reason ${tcase.action}`,
        expiresAt: tcase.action === 'TEMPORARY_UNLOCK' ? '2099-01-01T00:00:00.000Z' : null,
      });
      const effective = await store.getEffectiveState(userId);
      expect(effective.source).toBe('override');
      expect(effective.state).toBe(tcase.expected);
      expect(effective.overrideAction).toBe(tcase.action);
    }
  });

  test('expired temporary unlock falls back to baseline state', async () => {
    const store = new InMemoryAntiCheatEnforcementStore();
    const userId = '00000000-0000-0000-0000-00000000e102';
    await store.upsertFromRecommendation({
      userId,
      suspicionTier: 'SOFT_LOCK_RECOMMENDED',
      recommendation: {
        recommended_action: 'RESTRICT_ANALYSIS_ACCESS',
        severity: 'high',
        supporting_reasons: [],
      },
      reasonJson: [{ signal: 'test' }],
    });
    await store.applyModeratorOverride({
      userId,
      moderatorId: '00000000-0000-0000-0000-00000000e202',
      action: 'TEMPORARY_UNLOCK',
      reason: 'temporary allow',
      expiresAt: '2000-01-01T00:00:00.000Z',
    });
    const effective = await store.getEffectiveState(userId);
    expect(effective.source).toBe('baseline');
    expect(effective.baselineState).toBe('TRAINER_LOCKED');
    expect(effective.state).toBe('TRAINER_LOCKED');
  });

  test('effective read path returns resolved state fields', async () => {
    const store = new InMemoryAntiCheatEnforcementStore();
    const userId = '00000000-0000-0000-0000-00000000e103';
    await store.upsertFromRecommendation({
      userId,
      suspicionTier: 'ESCALATE_REVIEW',
      recommendation: {
        recommended_action: 'SEND_TO_MODERATOR_QUEUE',
        severity: 'critical',
        supporting_reasons: [],
      },
      reasonJson: [{ signal: 'test' }],
    });
    const effective = await store.getEffectiveState(userId);
    expect(effective.userId).toBe(userId);
    expect(effective.baselineState).toBe('REVIEW_LOCKED');
    expect(effective.sourceSuspicionTier).toBe('ESCALATE_REVIEW');
    expect(effective.sourceRecommendedAction).toBe('SEND_TO_MODERATOR_QUEUE');
    expect(effective.createdAt).toBeTruthy();
    expect(effective.updatedAt).toBeTruthy();
  });

  test('override and read endpoints fail closed when unauthenticated', async () => {
    const post = await moderatorEnforcementOverridePost(
      new Request('https://example.test/api/moderator/enforcement/override', {
        method: 'POST',
        body: JSON.stringify({
          user_id: '00000000-0000-0000-0000-00000000e104',
          action: 'CLEAR_RESTRICTION',
          reason: 'manual clear',
        }),
      })
    );
    expect(post.status).toBe(401);

    const get = await moderatorEnforcementGet(
      new Request('https://example.test/api/moderator/enforcement/00000000-0000-0000-0000-00000000e104'),
      { params: Promise.resolve({ userId: '00000000-0000-0000-0000-00000000e104' }) }
    );
    expect(get.status).toBe(401);
  });

  test('audit record is created when override action is applied', async () => {
    const fake = createFakeSupabaseForEnforcement();
    const store = new SupabaseAntiCheatEnforcementStore(fake.client);
    await store.applyModeratorOverride({
      userId: '00000000-0000-0000-0000-00000000e105',
      moderatorId: '00000000-0000-0000-0000-00000000e205',
      action: 'KEEP_LOCKED_PENDING_REVIEW',
      reason: 'pending moderation',
      expiresAt: null,
    });
    expect(fake.overrideAuditRows.length).toBe(1);
    expect(fake.overrideAuditRows[0]?.acted_by).toBe('00000000-0000-0000-0000-00000000e205');
    expect(fake.overrideAuditRows[0]?.target_user_id).toBe('00000000-0000-0000-0000-00000000e105');
    expect(fake.overrideAuditRows[0]?.action).toBe('KEEP_LOCKED_PENDING_REVIEW');
    expect(fake.overrideAuditRows[0]?.reason).toBe('pending moderation');
  });

  test('override endpoint validates reason as required', async () => {
    const originalFetch = globalThis.fetch;
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.test';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          id: '00000000-0000-0000-0000-00000000e301',
          app_metadata: { roles: ['moderator'] },
          user_metadata: {},
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    try {
      const response = await moderatorEnforcementOverridePost(
        new Request('https://example.test/api/moderator/enforcement/override', {
          method: 'POST',
          headers: { Authorization: 'Bearer moderator-token' },
          body: JSON.stringify({
            user_id: '00000000-0000-0000-0000-00000000e302',
            action: 'CLEAR_RESTRICTION',
            reason: '',
          }),
        })
      );
      expect(response.status).toBe(400);
      const payload = (await response.json()) as { error?: string };
      expect(payload.error).toContain('reason is required');
    } finally {
      globalThis.fetch = originalFetch;
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnon;
    }
  });

  test('override endpoint requires expires_at for temporary unlock', async () => {
    const originalFetch = globalThis.fetch;
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.test';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-test-key';
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          id: '00000000-0000-0000-0000-00000000e303',
          app_metadata: { roles: ['admin'] },
          user_metadata: {},
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    try {
      const response = await moderatorEnforcementOverridePost(
        new Request('https://example.test/api/moderator/enforcement/override', {
          method: 'POST',
          headers: { Authorization: 'Bearer admin-token' },
          body: JSON.stringify({
            user_id: '00000000-0000-0000-0000-00000000e304',
            action: 'TEMPORARY_UNLOCK',
            reason: 'temp unlock',
          }),
        })
      );
      expect(response.status).toBe(400);
      const payload = (await response.json()) as { error?: string };
      expect(payload.error).toContain('expires_at is required for TEMPORARY_UNLOCK');
    } finally {
      globalThis.fetch = originalFetch;
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnon;
    }
  });
});
