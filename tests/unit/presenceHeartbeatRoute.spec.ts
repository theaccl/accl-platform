import { expect, test } from '@playwright/test';

import {
  PRESENCE_HEARTBEAT_ACCOUNT_RATE_MAX,
  PRESENCE_HEARTBEAT_TAB_RATE_MAX,
  presenceHeartbeatPost,
  validatePresenceHeartbeatBody,
  type PresenceHeartbeatRouteDeps,
} from '../../app/api/presence/heartbeat/handler';

const AUTH_UID = '550e8400-e29b-41d4-a716-446655440000';
const SESSION_ID = '660e8400-e29b-41d4-a716-446655440001';
const TAB_ID = '770e8400-e29b-41d4-a716-446655440002';

function authUser() {
  return {
    id: AUTH_UID,
    email: 'user@example.com',
    email_confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: {},
    user_metadata: {},
    identities: [{ provider: 'email' }],
  };
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    tabPresenceId: TAB_ID,
    visibility: 'visible',
    interaction: false,
    ...overrides,
  };
}

function makeRequest(body: unknown, token = 'valid-token'): Request {
  return new Request('http://localhost/api/presence/heartbeat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

function makeDeps(overrides: Partial<PresenceHeartbeatRouteDeps> = {}): PresenceHeartbeatRouteDeps {
  const rateKeys: string[] = [];
  return {
    resolveAuthenticatedUser: async () => authUser(),
    bearerToken: () => 'valid-token',
    sessionIdFromAccessToken: () => SESSION_ID,
    checkRateLimit: (key: string) => {
      rateKeys.push(key);
      return { allowed: true as const };
    },
    createUserSupabase: () =>
      ({
        rpc: async () => ({
          data: '2026-07-13T12:00:00.000Z',
          error: null,
        }),
      }) as unknown as ReturnType<PresenceHeartbeatRouteDeps['createUserSupabase']>,
    ...overrides,
    // expose captured keys through a getter on the returned object for tests
  };
}

test.describe('presenceHeartbeat contract validation', () => {
  test('valid payload accepted', () => {
    const parsed = validatePresenceHeartbeatBody(validBody());
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.payload).toEqual({
        tabPresenceId: TAB_ID,
        visibility: 'visible',
        interaction: false,
      });
    }
  });

  test('malformed UUID rejected', () => {
    const parsed = validatePresenceHeartbeatBody(validBody({ tabPresenceId: 'not-a-uuid' }));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toBe('invalid_tab_presence_id');
  });

  test('invalid visibility rejected', () => {
    const parsed = validatePresenceHeartbeatBody(validBody({ visibility: 'away' }));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toBe('invalid_visibility');
  });

  test('missing/non-boolean interaction rejected', () => {
    expect(validatePresenceHeartbeatBody(validBody({ interaction: 'yes' })).ok).toBe(false);
    expect(validatePresenceHeartbeatBody(validBody({ interaction: 1 })).ok).toBe(false);
    expect(validatePresenceHeartbeatBody({ tabPresenceId: TAB_ID, visibility: 'visible' }).ok).toBe(
      false,
    );
  });

  test('client timestamp and identity fields rejected', () => {
    for (const field of [
      'timestamp',
      'interactionAt',
      'userId',
      'authSessionId',
      'sessionId',
    ] as const) {
      const parsed = validatePresenceHeartbeatBody(validBody({ [field]: 'x' }));
      expect(parsed.ok, field).toBe(false);
      if (!parsed.ok) expect(parsed.error).toBe('forbidden_field');
    }
  });
});

test.describe('presenceHeartbeatPost handler', () => {
  test('unauthenticated request rejected', async () => {
    const res = await presenceHeartbeatPost(makeRequest(validBody()), {
      ...makeDeps(),
      resolveAuthenticatedUser: async () => null,
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('unauthorized');
  });

  test('missing session_id in token rejected', async () => {
    const res = await presenceHeartbeatPost(
      makeRequest(validBody()),
      makeDeps({ sessionIdFromAccessToken: () => null }),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('session_id_required');
  });

  test('valid request returns ok and serverTime', async () => {
    const res = await presenceHeartbeatPost(makeRequest(validBody()), makeDeps());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, serverTime: '2026-07-13T12:00:00.000Z' });
  });

  test('rate-limit keys distinguish tabs and account ceiling remains separate', async () => {
    const keys: string[] = [];
    const deps = makeDeps({
      checkRateLimit: (key: string) => {
        keys.push(key);
        return { allowed: true as const };
      },
    });
    await presenceHeartbeatPost(makeRequest(validBody()), deps);
    expect(keys).toEqual([
      `presence:heartbeat:tab:${SESSION_ID}:${TAB_ID}`,
      `presence:heartbeat:account:${AUTH_UID}`,
    ]);
  });

  test('tab rate limit returns stable 429 shape', async () => {
    const res = await presenceHeartbeatPost(
      makeRequest(validBody()),
      makeDeps({
        checkRateLimit: (key: string) =>
          key.startsWith('presence:heartbeat:tab:')
            ? { allowed: false, retryAfterSec: 12 }
            : { allowed: true },
      }),
    );
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: 'rate_limited', retry_after_sec: 12 });
  });

  test('account rate limit returns stable 429 shape', async () => {
    const res = await presenceHeartbeatPost(
      makeRequest(validBody()),
      makeDeps({
        checkRateLimit: (key: string) =>
          key.startsWith('presence:heartbeat:account:')
            ? { allowed: false, retryAfterSec: 9 }
            : { allowed: true },
      }),
    );
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: 'rate_limited', retry_after_sec: 9 });
  });

  test('RPC error strings map to stable API errors', async () => {
    const cases: Array<{ message: string; status: number; error: string }> = [
      { message: 'authentication_required', status: 401, error: 'unauthorized' },
      { message: 'session_id_required', status: 401, error: 'unauthorized' },
      { message: 'invalid_visibility_state', status: 400, error: 'invalid_visibility' },
      { message: 'invalid_interaction', status: 400, error: 'invalid_interaction' },
      { message: 'tab_presence_id_required', status: 400, error: 'invalid_tab_presence_id' },
      { message: 'other_failure', status: 503, error: 'heartbeat_failed' },
    ];

    for (const c of cases) {
      const res = await presenceHeartbeatPost(
        makeRequest(validBody()),
        makeDeps({
          createUserSupabase: () =>
            ({
              rpc: async () => ({ data: null, error: { message: c.message } }),
            }) as unknown as ReturnType<PresenceHeartbeatRouteDeps['createUserSupabase']>,
        }),
      );
      expect(res.status, c.message).toBe(c.status);
      const body = await res.json();
      expect(body.error, c.message).toBe(c.error);
    }
  });

  test('documented rate thresholds are exported', () => {
    expect(PRESENCE_HEARTBEAT_TAB_RATE_MAX).toBe(10);
    expect(PRESENCE_HEARTBEAT_ACCOUNT_RATE_MAX).toBe(60);
  });
});
