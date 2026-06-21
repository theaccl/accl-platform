import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';

import {
  claimUsernamePost,
  type ClaimUsernameRouteDeps,
} from '../../app/api/profile/claim-username/route';
import type { EnsureOwnProfileRowResult } from '../../lib/ensureOwnProfileRow';

const AUTH_UID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_UID = '660e8400-e29b-41d4-a716-446655440001';

type ProfileRow = { id: string; username: string | null };

type UpdateOutcome =
  | { kind: 'success'; row: ProfileRow }
  | { kind: 'zero_rows' }
  | { kind: 'error'; code?: string; message: string };

type MockConfig = {
  profileUsername: string | null | 'absent';
  takenByOther?: boolean;
  takenLookupError?: boolean;
  profileLookupError?: boolean;
  update: UpdateOutcome;
  rereadAfterZero?: { username: string | null | 'absent'; error?: boolean };
  ensure?: EnsureOwnProfileRowResult;
};

function createClaimUsernameMockSupabase(config: MockConfig) {
  const updateFilters: Array<{ column: string; value: unknown; op: 'eq' | 'is' }> = [];
  const eqUserIds: string[] = [];
  let updateCalls = 0;

  const authAdmin = {
    getUserById: async (id: string) => ({
      data: { user: { id, user_metadata: {} } },
      error: null,
    }),
    updateUserById: async (_id: string, _patch: unknown) => ({ data: { user: {} }, error: null }),
  };

  const client = {
    from: (table: string) => {
      expect(table).toBe('profiles');
      const state: { eq: Record<string, unknown>; is?: { column: string; value: unknown } } = { eq: {} };

      const api = {
        select: (_cols: string) => api,
        eq: (column: string, value: unknown) => {
          state.eq[column] = value;
          if (column === 'id') eqUserIds.push(String(value));
          return api;
        },
        neq: (_column: string, _value: unknown) => api,
        is: (column: string, value: unknown) => {
          state.is = { column, value };
          return api;
        },
        update: (payload: unknown) => {
          updateCalls += 1;
          expect(payload).toEqual({ username: expect.any(String) });
          const chain = {
            eq: (column: string, value: unknown) => {
              updateFilters.push({ column, value, op: 'eq' });
              return chain;
            },
            is: (column: string, value: unknown) => {
              updateFilters.push({ column, value, op: 'is' });
              return chain;
            },
            select: (_cols: string) => chain,
            maybeSingle: async () => {
              if (config.update.kind === 'error') {
                return { data: null, error: { code: config.update.code, message: config.update.message } };
              }
              if (config.update.kind === 'zero_rows') {
                return { data: null, error: null };
              }
              return { data: config.update.row, error: null };
            },
          };
          return chain;
        },
        maybeSingle: async () => {
          if (config.takenLookupError && state.eq.username && !state.eq.id) {
            return { data: null, error: { message: 'taken lookup failed' } };
          }
          if (config.profileLookupError && state.eq.id === AUTH_UID && !state.is) {
            return { data: null, error: { message: 'profile lookup failed' } };
          }
          if (state.eq.username && state.eq.id === undefined) {
            return {
              data: config.takenByOther ? { id: OTHER_UID } : null,
              error: null,
            };
          }
          if (state.eq.id === AUTH_UID) {
            if (config.rereadAfterZero && updateCalls > 0) {
              if (config.rereadAfterZero.error) {
                return { data: null, error: { message: 'reread failed' } };
              }
              if (config.rereadAfterZero.username === 'absent') {
                return { data: null, error: null };
              }
              return {
                data: { id: AUTH_UID, username: config.rereadAfterZero.username },
                error: null,
              };
            }
            if (config.profileUsername === 'absent') {
              return { data: null, error: null };
            }
            return {
              data: { id: AUTH_UID, username: config.profileUsername },
              error: null,
            };
          }
          return { data: null, error: null };
        },
      };
      return api;
    },
    auth: { admin: authAdmin },
  } as unknown as SupabaseClient;

  return { client, updateFilters, eqUserIds, getUpdateCalls: () => updateCalls };
}

function makeRequest(body: Record<string, unknown>, token = 'valid-token'): Request {
  return new Request('http://localhost/api/profile/claim-username', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

function makeDeps(
  mock: ReturnType<typeof createClaimUsernameMockSupabase>,
  ensure?: EnsureOwnProfileRowResult,
): ClaimUsernameRouteDeps {
  return {
    resolveAuthenticatedUserId: async () => AUTH_UID,
    createServiceRoleClient: () => mock.client,
    ensureOwnProfileRow: async () =>
      ensure ?? ({ ok: true, existed: true } as EnsureOwnProfileRowResult),
  };
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

test.describe('claim-username route', () => {
  test('unauthenticated request returns 401 and performs no provisioning', async () => {
    const mock = createClaimUsernameMockSupabase({
      profileUsername: null,
      update: { kind: 'success', row: { id: AUTH_UID, username: 'alice' } },
    });
    let ensureCalls = 0;
    const res = await claimUsernamePost(makeRequest({ username: 'alice' }), {
      resolveAuthenticatedUserId: async () => null,
      createServiceRoleClient: () => mock.client,
      ensureOwnProfileRow: async () => {
        ensureCalls += 1;
        return { ok: true, existed: true };
      },
    });
    expect(res.status).toBe(401);
    expect(ensureCalls).toBe(0);
    expect(mock.getUpdateCalls()).toBe(0);
  });

  test('existing profile with null username uses CAS is_null and succeeds', async () => {
    const mock = createClaimUsernameMockSupabase({
      profileUsername: null,
      update: { kind: 'success', row: { id: AUTH_UID, username: 'alice' } },
    });
    const res = await claimUsernamePost(makeRequest({ username: 'alice' }), makeDeps(mock));
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ ok: true, username: 'alice' });
    expect(mock.updateFilters).toContainEqual({ column: 'id', value: AUTH_UID, op: 'eq' });
    expect(mock.updateFilters).toContainEqual({ column: 'username', value: null, op: 'is' });
  });

  test('missing profile is provisioned then username is claimed successfully', async () => {
    const mock = createClaimUsernameMockSupabase({
      profileUsername: null,
      update: { kind: 'success', row: { id: AUTH_UID, username: 'alice' } },
    });
    let ensuredUid: string | null = null;
    const res = await claimUsernamePost(makeRequest({ username: 'alice' }), {
      ...makeDeps(mock, { ok: true, existed: false }),
      ensureOwnProfileRow: async (_client, userId) => {
        ensuredUid = userId;
        return { ok: true, existed: false };
      },
    });
    expect(res.status).toBe(200);
    expect(ensuredUid).toBe(AUTH_UID);
  });

  test('ignored hostile body userId/id do not change ensure or profile mutation UID', async () => {
    const mock = createClaimUsernameMockSupabase({
      profileUsername: null,
      update: { kind: 'success', row: { id: AUTH_UID, username: 'alice' } },
    });
    let ensureUid: string | null = null;
    const baseDeps = makeDeps(mock);
    const res = await claimUsernamePost(
      makeRequest({ username: 'alice', userId: OTHER_UID, id: OTHER_UID }),
      {
        ...baseDeps,
        ensureOwnProfileRow: async (client, userId) => {
          ensureUid = userId;
          return baseDeps.ensureOwnProfileRow(client, userId);
        },
      },
    );
    expect(res.status).toBe(200);
    expect(await readJson(res)).toEqual({ ok: true, username: 'alice' });
    expect(ensureUid).toBe(AUTH_UID);
    expect(ensureUid).not.toBe(OTHER_UID);
    expect(mock.eqUserIds.every((id) => id === AUTH_UID)).toBe(true);
    expect(mock.eqUserIds).not.toContain(OTHER_UID);
    expect(mock.updateFilters).toContainEqual({ column: 'id', value: AUTH_UID, op: 'eq' });
  });

  test('existing real username returns 409 username_already_set without update', async () => {
    const mock = createClaimUsernameMockSupabase({
      profileUsername: 'already_me',
      update: { kind: 'success', row: { id: AUTH_UID, username: 'already_me' } },
    });
    const res = await claimUsernamePost(makeRequest({ username: 'alice' }), makeDeps(mock));
    expect(res.status).toBe(409);
    expect(await readJson(res)).toEqual({ error: 'username_already_set' });
    expect(mock.getUpdateCalls()).toBe(0);
  });

  test('proposed username owned by another user returns 409 username_taken', async () => {
    const mock = createClaimUsernameMockSupabase({
      profileUsername: null,
      takenByOther: true,
      update: { kind: 'success', row: { id: AUTH_UID, username: 'alice' } },
    });
    const res = await claimUsernamePost(makeRequest({ username: 'alice' }), makeDeps(mock));
    expect(res.status).toBe(409);
    expect(await readJson(res)).toEqual({ error: 'username_taken' });
    expect(mock.getUpdateCalls()).toBe(0);
  });

  test('update unique race 23505 returns 409 username_taken', async () => {
    const mock = createClaimUsernameMockSupabase({
      profileUsername: null,
      update: { kind: 'error', code: '23505', message: 'duplicate key value violates unique constraint' },
    });
    const res = await claimUsernamePost(makeRequest({ username: 'alice' }), makeDeps(mock));
    expect(res.status).toBe(409);
    expect(await readJson(res)).toEqual({ error: 'username_taken' });
  });

  test('concurrent different usernames: second CAS miss returns username_already_set without overwrite', async () => {
    const mock = createClaimUsernameMockSupabase({
      profileUsername: null,
      update: { kind: 'zero_rows' },
      rereadAfterZero: { username: 'alice' },
    });
    const res = await claimUsernamePost(makeRequest({ username: 'bob' }), makeDeps(mock));
    expect(res.status).toBe(409);
    expect(await readJson(res)).toEqual({ error: 'username_already_set' });
  });

  test('CAS zero rows with absent profile returns profile_provision_failed', async () => {
    const mock = createClaimUsernameMockSupabase({
      profileUsername: null,
      update: { kind: 'zero_rows' },
      rereadAfterZero: { username: 'absent' },
    });
    const res = await claimUsernamePost(makeRequest({ username: 'alice' }), makeDeps(mock));
    expect(res.status).toBe(503);
    expect(await readJson(res)).toEqual({ error: 'profile_provision_failed' });
  });

  test('CAS zero rows with still claim-eligible username returns profile_provision_failed', async () => {
    const mock = createClaimUsernameMockSupabase({
      profileUsername: null,
      update: { kind: 'zero_rows' },
      rereadAfterZero: { username: null },
    });
    const res = await claimUsernamePost(makeRequest({ username: 'alice' }), makeDeps(mock));
    expect(res.status).toBe(503);
    expect(await readJson(res)).toEqual({ error: 'profile_provision_failed' });
  });

  test('profile lookup failure returns profile_lookup_failed', async () => {
    const mock = createClaimUsernameMockSupabase({
      profileUsername: null,
      profileLookupError: true,
      update: { kind: 'success', row: { id: AUTH_UID, username: 'alice' } },
    });
    const res = await claimUsernamePost(makeRequest({ username: 'alice' }), makeDeps(mock));
    expect(res.status).toBe(503);
    expect(await readJson(res)).toEqual({ error: 'profile_lookup_failed' });
  });

  test('post-CAS re-read lookup failure returns profile_lookup_failed', async () => {
    const mock = createClaimUsernameMockSupabase({
      profileUsername: null,
      update: { kind: 'zero_rows' },
      rereadAfterZero: { username: null, error: true },
    });
    const res = await claimUsernamePost(makeRequest({ username: 'alice' }), makeDeps(mock));
    expect(res.status).toBe(503);
    expect(await readJson(res)).toEqual({ error: 'profile_lookup_failed' });
  });

  test('ensure lookup failure returns profile_lookup_failed without exposing detail', async () => {
    const mock = createClaimUsernameMockSupabase({
      profileUsername: null,
      update: { kind: 'success', row: { id: AUTH_UID, username: 'alice' } },
    });
    const res = await claimUsernamePost(makeRequest({ username: 'alice' }), {
      ...makeDeps(mock),
      ensureOwnProfileRow: async () => ({
        ok: false,
        error: 'profile_lookup_failed',
        detail: 'secret connection string leak',
      }),
    });
    expect(res.status).toBe(503);
    const body = await readJson(res);
    expect(body).toEqual({ error: 'profile_lookup_failed' });
    expect(JSON.stringify(body)).not.toContain('secret');
  });

  test('ensure provision failure returns profile_provision_failed without exposing detail', async () => {
    const mock = createClaimUsernameMockSupabase({
      profileUsername: null,
      update: { kind: 'success', row: { id: AUTH_UID, username: 'alice' } },
    });
    const res = await claimUsernamePost(makeRequest({ username: 'alice' }), {
      ...makeDeps(mock),
      ensureOwnProfileRow: async () => ({
        ok: false,
        error: 'profile_provision_failed',
        detail: 'trigger failed on player_ratings',
      }),
    });
    expect(res.status).toBe(503);
    const body = await readJson(res);
    expect(body).toEqual({ error: 'profile_provision_failed' });
    expect(JSON.stringify(body)).not.toContain('trigger');
  });

  test('whitespace stored username uses exact eq CAS value', async () => {
    const stored = '   ';
    const mock = createClaimUsernameMockSupabase({
      profileUsername: stored,
      update: { kind: 'success', row: { id: AUTH_UID, username: 'alice' } },
    });
    const res = await claimUsernamePost(makeRequest({ username: 'alice' }), makeDeps(mock));
    expect(res.status).toBe(200);
    expect(mock.updateFilters).toContainEqual({ column: 'username', value: stored, op: 'eq' });
  });

  test('generated fallback stored username uses exact eq CAS value', async () => {
    const stored = 'player_e84bd3f2';
    const mock = createClaimUsernameMockSupabase({
      profileUsername: stored,
      update: { kind: 'success', row: { id: AUTH_UID, username: 'alice' } },
    });
    const res = await claimUsernamePost(makeRequest({ username: 'alice' }), makeDeps(mock));
    expect(res.status).toBe(200);
    expect(mock.updateFilters).toContainEqual({ column: 'username', value: stored, op: 'eq' });
  });

  test('row absent after ensure returns profile_provision_failed', async () => {
    const mock = createClaimUsernameMockSupabase({
      profileUsername: 'absent',
      update: { kind: 'success', row: { id: AUTH_UID, username: 'alice' } },
    });
    const res = await claimUsernamePost(makeRequest({ username: 'alice' }), makeDeps(mock));
    expect(res.status).toBe(503);
    expect(await readJson(res)).toEqual({ error: 'profile_provision_failed' });
  });

  test('taken lookup error returns profile_lookup_failed', async () => {
    const mock = createClaimUsernameMockSupabase({
      profileUsername: null,
      takenLookupError: true,
      update: { kind: 'success', row: { id: AUTH_UID, username: 'alice' } },
    });
    const res = await claimUsernamePost(makeRequest({ username: 'alice' }), makeDeps(mock));
    expect(res.status).toBe(503);
    expect(await readJson(res)).toEqual({ error: 'profile_lookup_failed' });
  });
});

test.describe('claim-username route static guards', () => {
  test('route uses resolveAuthenticatedUserId, ensureOwnProfileRow, and CAS helper', () => {
    const src = readFileSync(
      join(process.cwd(), 'app', 'api', 'profile', 'claim-username', 'route.ts'),
      'utf8',
    );
    expect(src).toContain('resolveAuthenticatedUserId');
    expect(src).toContain('ensureOwnProfileRow');
    expect(src).toContain('resolveProfileUsernameClaimCas');
    expect(src).not.toContain('profile_not_found');
    expect(src).not.toContain('onConflict');
    expect(src).not.toContain('ignoreDuplicates');
    expect(src).not.toContain('.upsert(');
  });
});
