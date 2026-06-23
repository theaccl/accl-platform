import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { handleEmailConfirmCallback } from '@/lib/auth/emailConfirmCallback';
import { performSignUp, type LoginAuthHandlerDeps } from '@/app/login/authHandlers';
import {
  buildEmailConfirmationCallbackUrl,
  buildLoginConfirmationResultPath,
} from '@/lib/emailConfirmationRedirect';
import {
  EMAIL_CONFIRMATION_COMPLETE_MESSAGE,
  SIGNUP_VERIFICATION_PENDING_MESSAGE,
} from '@/lib/loginPageMode';

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

test.describe('manual sign-in return player experience', () => {
  test('successful signup with no session enters controlled check-email state', async () => {
    const result = await performSignUp(
      {
        email: 'pending@example.com',
        password: 'secret',
        username: 'alice',
        signupMode: true,
        nextParam: '/nexus',
        typoDecision: null,
        confirmationRedirectOrigin: SITE,
      },
      makeSignUpDeps(),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outcome).toBe('confirmation_pending');
      expect(result.message).toBe(SIGNUP_VERIFICATION_PENDING_MESSAGE);
      expect(result.destination).toBeUndefined();
    }
  });

  test('signup confirmation redirect omits post-auth next parameter', async () => {
    let capturedRedirect: string | undefined;
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
      makeSignUpDeps({
        signUp: async (args) => {
          capturedRedirect = args.options?.emailRedirectTo;
          return { error: null, data: { session: null, user: null } };
        },
      }),
    );

    expect(capturedRedirect).toBe(`${SITE}/auth/confirm`);
  });

  test('valid confirmation clears session and redirects to login success state', async () => {
    let signOutCalls = 0;
    const res = await handleEmailConfirmCallback(
      new Request(`${SITE}/auth/confirm?token_hash=valid&type=email`),
      {
        createSupabaseServerClient: async () =>
          ({
            auth: {
              verifyOtp: async () => ({ error: null, data: {} }),
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
    expect(res.headers.get('location')).toBe(`${SITE}${buildLoginConfirmationResultPath('complete')}`);
  });

  test('login success message matches locked copy', () => {
    expect(EMAIL_CONFIRMATION_COMPLETE_MESSAGE).toBe('Email verified. Sign in to continue.');
  });

  test('malformed confirmation link redirects to missing state', async () => {
    const res = await handleEmailConfirmCallback(new Request(`${SITE}/auth/confirm`), {
      createSupabaseServerClient: async () =>
        ({
          auth: {
            exchangeCodeForSession: async () => ({ error: null, data: {} }),
            verifyOtp: async () => ({ error: null, data: {} }),
          },
        }) as never,
    });
    expect(res.headers.get('location')).toContain('/login?confirmation=missing');
  });

  test('expired or invalid token redirects to failed state without signOut', async () => {
    let signOutCalls = 0;
    const res = await handleEmailConfirmCallback(
      new Request(`${SITE}/auth/confirm?token_hash=expired&type=email`),
      {
        createSupabaseServerClient: async () =>
          ({
            auth: {
              verifyOtp: async () => ({ error: { message: 'expired' }, data: {} }),
              signOut: async () => {
                signOutCalls += 1;
                return { error: null };
              },
            },
          }) as never,
      },
    );
    expect(signOutCalls).toBe(0);
    expect(res.headers.get('location')).toContain('/login?confirmation=failed');
  });

  test('unsupported confirmation type is rejected', async () => {
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

  test('open redirect via next query is ignored on confirmation success', async () => {
    const res = await handleEmailConfirmCallback(
      new Request(`${SITE}/auth/confirm?token_hash=good&type=email&next=//evil.example`),
      {
        createSupabaseServerClient: async () =>
          ({
            auth: {
              verifyOtp: async () => ({ error: null, data: {} }),
              getUser: async () => ({
                error: null,
                data: { user: confirmedEmailUser() },
              }),
              signOut: async () => ({ error: null }),
            },
          }) as never,
      },
    );
    expect(res.headers.get('location')).toBe(`${SITE}/login?confirmation=complete`);
  });

  test('confirmation callback URL builder never embeds next', () => {
    expect(buildEmailConfirmationCallbackUrl(SITE)).toBe(`${SITE}/auth/confirm`);
  });

  test('middleware does not intercept auth confirm route', () => {
    const middlewareSource = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf8');
    expect(middlewareSource).not.toMatch(/\/auth\/confirm/);
  });

  test('confirmation handler does not log raw tokens', () => {
    const source = readFileSync(join(process.cwd(), 'lib/auth/emailConfirmCallback.ts'), 'utf8');
    expect(source).not.toMatch(/console\.(log|info|debug|warn|error)/);
    expect(source).not.toMatch(/token_hash.*console/);
  });

  test('signOut failure cannot report successful verification', async () => {
    const res = await handleEmailConfirmCallback(
      new Request(`${SITE}/auth/confirm?token_hash=good&type=email`),
      {
        createSupabaseServerClient: async () =>
          ({
            auth: {
              verifyOtp: async () => ({ error: null, data: {} }),
              getUser: async () => ({
                error: null,
                data: { user: confirmedEmailUser() },
              }),
              signOut: async () => ({ error: { message: 'signout_failed' } }),
            },
          }) as never,
      },
    );
    expect(res.headers.get('location')).toContain('/login?confirmation=failed');
  });

  test('login page clears local session when confirmation=complete', () => {
    const loginSource = readFileSync(join(process.cwd(), 'app/login/page.tsx'), 'utf8');
    expect(loginSource).toContain("confirmationResult === 'complete'");
    expect(loginSource).toContain('signOut({ scope: \'local\' })');
    expect(loginSource).toContain('EMAIL_CONFIRMATION_COMPLETE_MESSAGE');
    expect(loginSource).toMatch(/onAuthStateChange[\s\S]*confirmationResult === 'complete'/);
  });
});
