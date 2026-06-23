import { expect, test } from '@playwright/test';

import { handleEmailConfirmCallback, parseSignupConfirmationOtpType } from '@/lib/auth/emailConfirmCallback';
import { resendConfirmationPost } from '@/lib/auth/resendConfirmationHandler';
import { performSignUp, type LoginAuthHandlerDeps } from '@/app/login/authHandlers';
import {
  buildEmailConfirmationCallbackUrl,
  getCanonicalEmailConfirmationOrigin,
  resolveTrustedEmailConfirmationOrigin,
} from '@/lib/emailConfirmationRedirect';
import {
  hasVerifiedMailbox,
  isEmailPasswordIdentity,
  requiresEmailVerificationForProvisioning,
} from '@/lib/emailVerificationGate';
import { loadOrCreateOwnProfile } from '@/lib/loadOwnProfileForAccount';
import {
  claimUsernamePost,
  type ClaimUsernameRouteDeps,
} from '@/app/api/profile/claim-username/handler';
import {
  onboardingStatusGet,
  type OnboardingStatusRouteDeps,
} from '@/app/api/profile/onboarding-status/handler';
import { ensureOwnProfileRow } from '@/lib/ensureOwnProfileRow';

const SITE = 'https://play.theaccl.com';

function confirmedEmailUser(email = 'user@gmail.com') {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email,
    email_confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'email' },
    user_metadata: {},
    identities: [{ provider: 'email' }],
  };
}

function unconfirmedEmailUser(email = 'pending@example.com') {
  return {
    id: '660e8400-e29b-41d4-a716-446655440001',
    email,
    email_confirmed_at: null,
    confirmed_at: null,
    app_metadata: { provider: 'email' },
    user_metadata: {},
    identities: [{ provider: 'email' }],
  };
}

function oauthUser(email = 'oauth@example.com') {
  return {
    id: '770e8400-e29b-41d4-a716-446655440002',
    email,
    email_confirmed_at: null,
    app_metadata: { provider: 'google' },
    user_metadata: {},
    identities: [{ provider: 'google' }],
  };
}

function makeSignUpDeps(overrides: Partial<LoginAuthHandlerDeps> = {}): LoginAuthHandlerDeps {
  return {
    signInWithPassword: async () => ({
      error: null,
      data: { session: { access_token: 'token' }, user: confirmedEmailUser() },
    }),
    signUp: async () => ({
      error: null,
      data: { session: null, user: null },
    }),
    auditLogin: async () => {},
    resolvePostAuthRoute: async () => ({ status: 'redirect', destination: '/profile' }),
    ...overrides,
  };
}

test.describe('email verification gate', () => {
  test('confirmed email-password user does not require verification', () => {
    expect(requiresEmailVerificationForProvisioning(confirmedEmailUser())).toBe(false);
    expect(hasVerifiedMailbox(confirmedEmailUser())).toBe(true);
    expect(isEmailPasswordIdentity(confirmedEmailUser())).toBe(true);
  });

  test('unconfirmed email-password user requires verification', () => {
    expect(requiresEmailVerificationForProvisioning(unconfirmedEmailUser())).toBe(true);
  });

  test('oauth identity is not blocked by email-password gate', () => {
    expect(isEmailPasswordIdentity(oauthUser())).toBe(false);
    expect(requiresEmailVerificationForProvisioning(oauthUser())).toBe(false);
  });
});

test.describe('signup confirmation redirect', () => {
  test('signup supplies a safe confirmation redirect', async () => {
    let capturedRedirect: string | undefined;
    const deps = makeSignUpDeps({
      signUp: async (args) => {
        capturedRedirect = args.options?.emailRedirectTo;
        return { error: null, data: { session: null, user: null } };
      },
    });

    await performSignUp(
      {
        email: 'user@gmail.com',
        password: 'secret',
        username: 'alice',
        signupMode: true,
        nextParam: '/nexus',
        typoDecision: null,
        confirmationRedirectOrigin: SITE,
      },
      deps,
    );

    expect(capturedRedirect).toBe(`${SITE}/auth/confirm`);
  });

  test('no-session signup enters verification pending with exact email', async () => {
    const result = await performSignUp(
      {
        email: '  Pending@Example.COM ',
        password: 'secret',
        username: 'alice',
        signupMode: true,
        nextParam: null,
        typoDecision: null,
        confirmationRedirectOrigin: SITE,
      },
      makeSignUpDeps(),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outcome).toBe('confirmation_pending');
      expect(result.pendingEmail).toBe('Pending@example.com');
      expect(result.destination).toBeUndefined();
    }
  });
});

test.describe('resend confirmation', () => {
  test('resend uses signup semantics and generic messaging', async () => {
    let resendArgs: unknown;
    const deps = {
      getClientIp: () => '127.0.0.1',
      checkRateLimit: () => ({ allowed: true as const }),
      createAuthClient: () =>
        ({
          auth: {
            resend: async (args: unknown) => {
              resendArgs = args;
              return { error: null, data: {} };
            },
          },
        }) as never,
      resolveTrustedEmailConfirmationOrigin: () => SITE,
    };

    const res = await resendConfirmationPost(
      new Request('http://localhost/api/auth/resend-confirmation', {
        method: 'POST',
        headers: { origin: SITE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com', next: '/nexus' }),
      }),
      deps,
    );

    expect(res.status).toBe(200);
    expect(resendArgs).toEqual({
      type: 'signup',
      email: 'user@example.com',
      options: { emailRedirectTo: `${SITE}/auth/confirm` },
    });
    const body = (await res.json()) as { ok: boolean; message: string };
    expect(body.ok).toBe(true);
    expect(body.message).not.toMatch(/not found|already exists/i);
  });

  test('resend is throttled per email', async () => {
    let calls = 0;
    const deps = {
      getClientIp: () => '127.0.0.1',
      checkRateLimit: (key: string) => {
        calls += 1;
        if (key.startsWith('resend-confirmation:email:')) {
          return { allowed: false as const, retryAfterSec: 120 };
        }
        return { allowed: true as const };
      },
      createAuthClient: () =>
        ({
          auth: { resend: async () => ({ error: null, data: {} }) },
        }) as never,
      resolveTrustedEmailConfirmationOrigin: () => SITE,
    };

    const res = await resendConfirmationPost(
      new Request('http://localhost/api/auth/resend-confirmation', {
        method: 'POST',
        headers: { origin: SITE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com' }),
      }),
      deps,
    );

    expect(res.status).toBe(429);
    expect(calls).toBeGreaterThan(0);
  });

  test('resend ignores attacker Origin and uses canonical callback', async () => {
    let resendArgs: unknown;
    const deps = {
      getClientIp: () => '127.0.0.1',
      checkRateLimit: () => ({ allowed: true as const }),
      createAuthClient: () =>
        ({
          auth: {
            resend: async (args: unknown) => {
              resendArgs = args;
              return { error: null, data: {} };
            },
          },
        }) as never,
      resolveTrustedEmailConfirmationOrigin: (input?: { requestOrigin?: string | null }) =>
        resolveTrustedEmailConfirmationOrigin({ ...input, nodeEnv: 'production' }),
    };

    await resendConfirmationPost(
      new Request('http://localhost/api/auth/resend-confirmation', {
        method: 'POST',
        headers: { origin: 'https://evil.example', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com' }),
      }),
      deps,
    );

    expect(resendArgs).toEqual({
      type: 'signup',
      email: 'user@example.com',
      options: { emailRedirectTo: `${SITE}/auth/confirm` },
    });
  });
});

test.describe('confirmation callback', () => {
  test('parseSignupConfirmationOtpType accepts email only', () => {
    expect(parseSignupConfirmationOtpType('email')).toBe('email');
    expect(parseSignupConfirmationOtpType('signup')).toBeNull();
    expect(parseSignupConfirmationOtpType('recovery')).toBeNull();
    expect(parseSignupConfirmationOtpType('magiclink')).toBeNull();
    expect(parseSignupConfirmationOtpType('not-a-type')).toBeNull();
    expect(parseSignupConfirmationOtpType(null)).toBeNull();
  });

  test('token_hash signup flow accepts type=email and returns to manual sign-in', async () => {
    let verifyArgs: unknown;
    let signOutCalls = 0;
    const res = await handleEmailConfirmCallback(
      new Request(`${SITE}/auth/confirm?token_hash=good&type=email`),
      {
        createSupabaseServerClient: async () =>
          ({
            auth: {
              verifyOtp: async (args: unknown) => {
                verifyArgs = args;
                return { error: null, data: {} };
              },
              getUser: async () => ({
                error: null,
                data: { user: confirmedEmailUser() },
              }),
              signOut: async () => {
                signOutCalls += 1;
                return { error: null };
              },
            },
          }) as never,
      },
    );

    expect(verifyArgs).toEqual({ token_hash: 'good', type: 'email' });
    expect(signOutCalls).toBe(1);
    expect(res.headers.get('location')).toBe(`${SITE}/login?confirmation=complete`);
    expect(res.headers.get('cache-control')).toContain('no-store');
  });

  test('unsupported otp type signup is rejected without verifyOtp', async () => {
    let verifyCalls = 0;
    const res = await handleEmailConfirmCallback(
      new Request(`${SITE}/auth/confirm?token_hash=abc&type=signup`),
      {
        createSupabaseServerClient: async () =>
          ({
            auth: {
              verifyOtp: async () => {
                verifyCalls += 1;
                return { error: null, data: {} };
              },
              getUser: async () => ({ error: null, data: { user: confirmedEmailUser() } }),
            },
          }) as never,
      },
    );

    expect(verifyCalls).toBe(0);
    expect(res.headers.get('location')).toContain('/login?confirmation=missing');
  });

  test('arbitrary otp type string is rejected', async () => {
    let verifyCalls = 0;
    const res = await handleEmailConfirmCallback(
      new Request(`${SITE}/auth/confirm?token_hash=abc&type=recovery`),
      {
        createSupabaseServerClient: async () =>
          ({
            auth: {
              verifyOtp: async () => {
                verifyCalls += 1;
                return { error: null, data: {} };
              },
            },
          }) as never,
      },
    );

    expect(verifyCalls).toBe(0);
    expect(res.headers.get('location')).toContain('/login?confirmation=missing');
  });

  test('rejects missing parameters', async () => {
    const res = await handleEmailConfirmCallback(
      new Request(`${SITE}/auth/confirm`),
      {
        createSupabaseServerClient: async () =>
          ({
            auth: {
              exchangeCodeForSession: async () => ({ error: null, data: {} }),
              verifyOtp: async () => ({ error: null, data: {} }),
            },
          }) as never,
      },
    );
    expect(res.headers.get('location')).toContain('/login?confirmation=missing');
  });

  test('ignores next query and always redirects to login success', async () => {
    let signOutCalls = 0;
    const res = await handleEmailConfirmCallback(
      new Request(`${SITE}/auth/confirm?code=abc&next=https://evil.example`),
      {
        createSupabaseServerClient: async () =>
          ({
            auth: {
              exchangeCodeForSession: async () => ({ error: null, data: {} }),
              getUser: async () => ({
                error: null,
                data: { user: confirmedEmailUser() },
              }),
              signOut: async () => {
                signOutCalls += 1;
                return { error: null };
              },
            },
          }) as never,
      },
    );
    expect(signOutCalls).toBe(1);
    expect(res.headers.get('location')).toBe(`${SITE}/login?confirmation=complete`);
  });

  test('invalid confirmation produces failed redirect', async () => {
    const res = await handleEmailConfirmCallback(
      new Request(`${SITE}/auth/confirm?token_hash=bad&type=email`),
      {
        createSupabaseServerClient: async () =>
          ({
            auth: {
              verifyOtp: async () => ({ error: { message: 'expired' }, data: {} }),
            },
          }) as never,
      },
    );
    expect(res.headers.get('location')).toContain('/login?confirmation=failed');
  });
});

test.describe('provisioning gates', () => {
  test('unconfirmed user cannot claim username or trigger ensureOwnProfileRow', async () => {
    let ensureCalls = 0;
    const mockClient = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
    } as never;

    const res = await claimUsernamePost(
      new Request('http://localhost/api/profile/claim-username', {
        method: 'POST',
        headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'alice' }),
      }),
      {
        resolveAuthenticatedUser: async () => unconfirmedEmailUser(),
        createServiceRoleClient: () => mockClient,
        ensureOwnProfileRow: async () => {
          ensureCalls += 1;
          return { ok: true, existed: false };
        },
      } satisfies ClaimUsernameRouteDeps,
    );

    expect(res.status).toBe(403);
    expect(ensureCalls).toBe(0);
  });

  test('onboarding status reports needsEmailVerification for unconfirmed user', async () => {
    const res = await onboardingStatusGet(
      new Request('http://localhost/api/profile/onboarding-status', {
        headers: { Authorization: 'Bearer token' },
      }),
      {
        resolveAuthenticatedUser: async () => unconfirmedEmailUser(),
        createServiceRoleClient: () =>
          ({
            from: () => ({
              select: () => ({
                eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
              }),
            }),
          }) as never,
      } satisfies OnboardingStatusRouteDeps,
    );
    const body = (await res.json()) as { needsEmailVerification?: boolean };
    expect(body.needsEmailVerification).toBe(true);
  });

  test('loadOrCreateOwnProfile does not insert for unconfirmed email user', async () => {
    let insertCalls = 0;
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
        insert: () => {
          insertCalls += 1;
          return { select: () => ({ single: async () => ({ data: null, error: null }) }) };
        },
      }),
    } as never;

    const result = await loadOrCreateOwnProfile(client, unconfirmedEmailUser() as never);
    expect(result.ok).toBe(false);
    expect(insertCalls).toBe(0);
  });

  test('confirmed user can still pass provisioning gate', async () => {
    const ensured = await ensureOwnProfileRow(
      {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
          insert: () => ({ error: null }),
        }),
      } as never,
      confirmedEmailUser().id,
    );
    expect(ensured.ok).toBe(true);
  });
});

test.describe('redirect helpers', () => {
  test('resolveTrustedEmailConfirmationOrigin uses canonical origin in production', () => {
    expect(
      resolveTrustedEmailConfirmationOrigin({
        requestOrigin: 'https://evil.example',
        clientOrigin: 'https://preview.vercel.app',
        nodeEnv: 'production',
      }),
    ).toBe(getCanonicalEmailConfirmationOrigin());
  });

  test('resolveTrustedEmailConfirmationOrigin allowlists local dev origins', () => {
    expect(
      resolveTrustedEmailConfirmationOrigin({
        clientOrigin: 'http://localhost:3000',
        nodeEnv: 'development',
      }),
    ).toBe('http://localhost:3000');
  });

  test('resolveTrustedEmailConfirmationOrigin rejects preview origins in development', () => {
    expect(
      resolveTrustedEmailConfirmationOrigin({
        clientOrigin: 'https://accl-platform.vercel.app',
        nodeEnv: 'development',
      }),
    ).toBe(getCanonicalEmailConfirmationOrigin());
  });

  test('buildEmailConfirmationCallbackUrl uses fixed callback path only', () => {
    expect(buildEmailConfirmationCallbackUrl(SITE)).toBe(`${SITE}/auth/confirm`);
  });
});
