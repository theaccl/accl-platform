import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  onboardingStatusGet,
  type OnboardingStatusRouteDeps,
} from '../../app/api/profile/onboarding-status/handler';

const AUTH_UID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_UID = '660e8400-e29b-41d4-a716-446655440001';

function confirmedAuthUser() {
  return {
    id: AUTH_UID,
    email: 'confirmed@example.com',
    email_confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'email' },
    user_metadata: {},
    identities: [{ provider: 'email' }],
  };
}

type MockConfig = {
  profileUsername?: string | null | 'absent';
  lookupError?: boolean;
};

function createOnboardingStatusMockSupabase(config: MockConfig) {
  const eqUserIds: string[] = [];
  let selectCalls = 0;
  let insertCalls = 0;
  let updateCalls = 0;
  let upsertCalls = 0;
  let deleteCalls = 0;

  const client = {
    from: (table: string) => {
      expect(table).toBe('profiles');
      return {
        select: () => ({
          eq: (column: string, value: unknown) => {
            expect(column).toBe('id');
            eqUserIds.push(String(value));
            return {
              maybeSingle: async () => {
                selectCalls += 1;
                if (config.lookupError) {
                  return { data: null, error: { message: 'db read failed' } };
                }
                if (config.profileUsername === 'absent') {
                  return { data: null, error: null };
                }
                return {
                  data: { username: config.profileUsername ?? null },
                  error: null,
                };
              },
            };
          },
        }),
        insert: () => {
          insertCalls += 1;
          return {};
        },
        update: () => {
          updateCalls += 1;
          return {};
        },
        upsert: () => {
          upsertCalls += 1;
          return {};
        },
        delete: () => {
          deleteCalls += 1;
          return {};
        },
      };
    },
  } as unknown as SupabaseClient;

  return {
    client,
    eqUserIds,
    getSelectCalls: () => selectCalls,
    getInsertCalls: () => insertCalls,
    getUpdateCalls: () => updateCalls,
    getUpsertCalls: () => upsertCalls,
    getDeleteCalls: () => deleteCalls,
  };
}

function makeDeps(
  mock: ReturnType<typeof createOnboardingStatusMockSupabase>,
  promoteResult: Awaited<ReturnType<typeof import('@/lib/promotePendingSignupUsername').tryPromotePendingSignupUsername>> = {
    status: 'none',
  },
): OnboardingStatusRouteDeps {
  return {
    resolveAuthenticatedUser: async () => confirmedAuthUser(),
    createServiceRoleClient: () => mock.client,
    ensureOwnProfileRow: async () => ({ ok: true, existed: true }),
    tryPromotePendingSignupUsername: async () => promoteResult,
  };
}

function makeGetRequest(query = ''): Request {
  return new Request(`http://localhost/api/profile/onboarding-status${query}`, {
    method: 'GET',
    headers: { Authorization: 'Bearer valid-token' },
  });
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

test.describe('onboarding-status route', () => {
  test('unauthenticated request returns 401 and performs no profile query', async () => {
    const mock = createOnboardingStatusMockSupabase({ profileUsername: null });
    const res = await onboardingStatusGet(makeGetRequest(), {
      resolveAuthenticatedUser: async () => null,
      createServiceRoleClient: () => mock.client,
      ensureOwnProfileRow: async () => ({ ok: true, existed: true }),
      tryPromotePendingSignupUsername: async () => ({ status: 'none' }),
    });
    expect(res.status).toBe(401);
    expect(mock.getSelectCalls()).toBe(0);
  });

  test('missing profile returns profileExists false and needsUsername true', async () => {
    const mock = createOnboardingStatusMockSupabase({ profileUsername: 'absent' });
    const res = await onboardingStatusGet(makeGetRequest(), makeDeps(mock));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({
      needsEmailVerification: false,
      needsUsername: true,
      profileExists: false,
      username: null,
    });
  });

  test('existing profile with SQL null username', async () => {
    const mock = createOnboardingStatusMockSupabase({ profileUsername: null });
    const res = await onboardingStatusGet(makeGetRequest(), makeDeps(mock));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({
      needsEmailVerification: false,
      needsUsername: true,
      profileExists: true,
      username: null,
    });
  });

  test('existing profile with empty string username', async () => {
    const mock = createOnboardingStatusMockSupabase({ profileUsername: '' });
    const res = await onboardingStatusGet(makeGetRequest(), makeDeps(mock));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({
      needsEmailVerification: false,
      needsUsername: true,
      profileExists: true,
      username: null,
    });
  });

  test('existing profile with whitespace-only username', async () => {
    const mock = createOnboardingStatusMockSupabase({ profileUsername: '   ' });
    const res = await onboardingStatusGet(makeGetRequest(), makeDeps(mock));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({
      needsEmailVerification: false,
      needsUsername: true,
      profileExists: true,
      username: null,
    });
  });

  test('existing profile with generated fallback username', async () => {
    const mock = createOnboardingStatusMockSupabase({ profileUsername: 'player_e84bd3f2' });
    const res = await onboardingStatusGet(makeGetRequest(), makeDeps(mock));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({
      needsEmailVerification: false,
      needsUsername: true,
      profileExists: true,
      username: null,
    });
  });

  test('existing profile with real username returns normalized username', async () => {
    const mock = createOnboardingStatusMockSupabase({ profileUsername: '  alice  ' });
    const res = await onboardingStatusGet(makeGetRequest(), makeDeps(mock));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({
      needsEmailVerification: false,
      needsUsername: false,
      profileExists: true,
      username: 'alice',
    });
  });

  test('profile lookup database error returns profile_unavailable without raw detail', async () => {
    const mock = createOnboardingStatusMockSupabase({ lookupError: true });
    const res = await onboardingStatusGet(makeGetRequest(), makeDeps(mock));
    expect(res.status).toBe(503);
    const body = await readJson(res);
    expect(body.error).toBe('profile_unavailable');
    expect(JSON.stringify(body)).not.toContain('db read failed');
  });

  test('profile lookup uses authenticated UID from Bearer resolution only', async () => {
    const mock = createOnboardingStatusMockSupabase({ profileUsername: null });
    const res = await onboardingStatusGet(
      makeGetRequest(`?userId=${OTHER_UID}&id=${OTHER_UID}`),
      makeDeps(mock),
    );
    expect(res.status).toBe(200);
    expect(mock.eqUserIds).toEqual([AUTH_UID]);
    expect(mock.eqUserIds).not.toContain(OTHER_UID);
  });

  test('promoted signup username skips duplicate onboarding', async () => {
    const mock = createOnboardingStatusMockSupabase({ profileUsername: null });
    const res = await onboardingStatusGet(
      makeGetRequest(),
      makeDeps(mock, { status: 'promoted', username: 'alice' }),
    );
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({
      needsEmailVerification: false,
      needsUsername: false,
      profileExists: true,
      username: 'alice',
    });
  });

  test('username conflict returns replacement guidance', async () => {
    const mock = createOnboardingStatusMockSupabase({ profileUsername: null });
    const res = await onboardingStatusGet(
      makeGetRequest(),
      makeDeps(mock, { status: 'conflict', reason: 'username_taken' }),
    );
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.needsUsername).toBe(true);
    expect(body.signupUsernameConflict).toBe(true);
    expect(body.signupUsernameConflictMessage).toContain('no longer available');
  });

  test('route performs no insert, update, upsert, or delete', async () => {
    const mock = createOnboardingStatusMockSupabase({ profileUsername: null });
    await onboardingStatusGet(makeGetRequest(), makeDeps(mock));
    expect(mock.getInsertCalls()).toBe(0);
    expect(mock.getUpdateCalls()).toBe(0);
    expect(mock.getUpsertCalls()).toBe(0);
    expect(mock.getDeleteCalls()).toBe(0);
  });

  test('profileExists is additive and needsUsername semantics are preserved', async () => {
    const missing = createOnboardingStatusMockSupabase({ profileUsername: 'absent' });
    const missingRes = await onboardingStatusGet(makeGetRequest(), makeDeps(missing));
    const missingBody = await readJson(missingRes);
    expect(missingBody.needsUsername).toBe(true);
    expect(missingBody.profileExists).toBe(false);

    const complete = createOnboardingStatusMockSupabase({ profileUsername: 'bob' });
    const completeRes = await onboardingStatusGet(makeGetRequest(), makeDeps(complete));
    const completeBody = await readJson(completeRes);
    expect(completeBody.needsUsername).toBe(false);
    expect(completeBody.profileExists).toBe(true);
    expect(completeBody.username).toBe('bob');
  });
});

test.describe('onboarding-status route static guards', () => {
  test('route source performs no profile mutations', () => {
    const src = readFileSync(
      join(process.cwd(), 'app', 'api', 'profile', 'onboarding-status', 'handler.ts'),
      'utf8',
    );
    expect(src).toContain('resolveAuthenticatedUser');
    expect(src).not.toMatch(/\.insert\s*\(/);
    expect(src).not.toMatch(/\.update\s*\(/);
    expect(src).not.toMatch(/\.upsert\s*\(/);
    expect(src).not.toMatch(/\.delete\s*\(/);
  });
});
