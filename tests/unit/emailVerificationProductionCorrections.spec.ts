import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { handleEmailConfirmCallback } from '@/lib/auth/emailConfirmCallback';
import {
  isInvalidStoredSessionError,
  isTransientAuthNetworkError,
} from '@/lib/auth/sessionErrorClassification';
import { resolvePostAuthRoute } from '@/lib/loginPostAuthRoute';
import {
  EMAIL_CONFIRMATION_COMPLETE_HEADING,
  EMAIL_CONFIRMATION_COMPLETE_MESSAGE,
  getLoginEmailAutocomplete,
  getPasswordAutocomplete,
  getSignupPublicHandleAutocomplete,
} from '@/lib/loginPageMode';
import { readPendingSignupUsernameFromMetadata, tryPromotePendingSignupUsername } from '@/lib/promotePendingSignupUsername';

const SITE = 'https://play.theaccl.com';

function confirmedEmailUser(email = 'user@gmail.com', username = 'alice') {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    email,
    email_confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'email' },
    user_metadata: { username },
    identities: [{ provider: 'email' }],
  };
}

test.describe('confirmation return UX', () => {
  test('successful callback redirects to login confirmation complete', async () => {
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
              signOut: async () => ({ error: null }),
            },
          }) as never,
      },
    );
    expect(res.headers.get('location')).toBe(`${SITE}/login?confirmation=complete`);
  });

  test('exact success copy is locked', () => {
    expect(EMAIL_CONFIRMATION_COMPLETE_MESSAGE).toBe('Email verified. Sign in to continue.');
    expect(EMAIL_CONFIRMATION_COMPLETE_HEADING).toBe('Email verified');
  });

  test('login page renders dedicated confirmation success panel', () => {
    const src = readFileSync(join(process.cwd(), 'app/login/page.tsx'), 'utf8');
    expect(src).toContain('data-testid="confirmation-complete-panel"');
    expect(src).toContain('EMAIL_CONFIRMATION_COMPLETE_HEADING');
    expect(src).toContain('confirmationComplete && !verificationPendingEmail');
  });

  test('auth listener cannot auto-route during confirmation complete', () => {
    const src = readFileSync(join(process.cwd(), 'app/login/page.tsx'), 'utf8');
    expect(src).toMatch(/onAuthStateChange[\s\S]*if \(confirmationComplete\) return/);
  });
});

test.describe('autofill semantics', () => {
  test('login email remains the authentication identifier autocomplete', () => {
    expect(getLoginEmailAutocomplete()).toBe('email');
  });

  test('signup public handle is not exposed as auth username credential', () => {
    expect(getSignupPublicHandleAutocomplete()).toBe('off');
  });

  test('login page uses distinct stable field names', () => {
    const src = readFileSync(join(process.cwd(), 'app/login/page.tsx'), 'utf8');
    expect(src).toContain('name="accl-login-email"');
    expect(src).toContain('name="accl-login-password"');
    expect(src).toContain('name="accl-signup-public-handle"');
    expect(src).not.toMatch(/signup-username[\s\S]{0,200}autoComplete="username"/);
  });

  test('onboarding username input does not use auth username autocomplete', () => {
    const src = readFileSync(join(process.cwd(), 'app/onboarding/username/page.tsx'), 'utf8');
    expect(src).toContain('autoComplete="off"');
    expect(src).not.toContain('autoComplete="username"');
  });

  test('password autocomplete stays mode-specific for password managers', () => {
    expect(getPasswordAutocomplete('login')).toBe('current-password');
    expect(getPasswordAutocomplete('signup')).toBe('new-password');
  });
});

test.describe('username provisioning', () => {
  function profileSelectMock(row: { username?: string | null } | null, error: unknown = null) {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: row, error }),
          }),
        }),
      }),
    } as never;
  }

  const ensureRowOk = async () => ({ ok: true as const, existed: false as const });

  test('pending signup username is read from metadata only', () => {
    expect(readPendingSignupUsernameFromMetadata(confirmedEmailUser() as never)).toBe('alice');
    expect(readPendingSignupUsernameFromMetadata({ user_metadata: {} } as never)).toBeNull();
  });

  test('promotion is idempotent when profile already has a username', async () => {
    const result = await tryPromotePendingSignupUsername(
      profileSelectMock({ username: 'alice' }),
      confirmedEmailUser() as never,
      ensureRowOk,
    );
    expect(result).toEqual({ status: 'already_claimed', username: 'alice' });
  });

  test('missing metadata skips promotion and falls back to ordinary onboarding', async () => {
    const result = await tryPromotePendingSignupUsername(
      profileSelectMock(null),
      confirmedEmailUser('user@gmail.com', '') as never,
      ensureRowOk,
    );
    expect(result).toEqual({ status: 'none' });
  });

  test('invalid metadata username returns conflict without claiming', async () => {
    const result = await tryPromotePendingSignupUsername(
      profileSelectMock({ username: null }),
      confirmedEmailUser('user@gmail.com', '!!!') as never,
      ensureRowOk,
    );
    expect(result).toEqual({ status: 'conflict', reason: 'invalid_username' });
  });

  test('post-auth route sends conflict query when onboarding reports taken username', async () => {
    const originalFetch = global.fetch;
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/api/profile/onboarding-status')) {
        return new Response(
          JSON.stringify({
            needsUsername: true,
            signupUsernameConflict: true,
          }),
          { status: 200 },
        );
      }
      if (url.includes('/api/public/attach-growth-profile')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return originalFetch(input, init);
    }) as typeof fetch;

    const route = await resolvePostAuthRoute('token', null, confirmedEmailUser() as never);
    global.fetch = originalFetch;

    expect(route.status).toBe('redirect');
    if (route.status === 'redirect') {
      expect(route.destination).toContain('/onboarding/username');
      expect(route.destination).toContain('conflict=signup_username');
    }
  });
});

test.describe('stale session cleanup', () => {
  test('deleted auth user errors are treated as invalid stored sessions', () => {
    expect(isInvalidStoredSessionError({ message: 'User not found' })).toBe(true);
    expect(isInvalidStoredSessionError({ message: 'Invalid JWT' })).toBe(true);
  });

  test('network failures are not treated as invalid stored sessions', () => {
    expect(isTransientAuthNetworkError({ message: 'Failed to fetch', name: 'TypeError' })).toBe(true);
    expect(isInvalidStoredSessionError({ message: 'Failed to fetch' })).toBe(false);
  });

  test('generic auth status codes without invalid-session messages do not sign out', () => {
    expect(isInvalidStoredSessionError({ message: 'Forbidden', status: 403 })).toBe(false);
    expect(isInvalidStoredSessionError({ message: 'Unauthorized', status: 401 })).toBe(false);
    expect(isInvalidStoredSessionError({ message: 'Service Unavailable', status: 503 })).toBe(false);
    expect(isInvalidStoredSessionError(null)).toBe(false);
  });

  test('unknown getUser errors fall back to existing session instead of signing out', () => {
    const src = readFileSync(join(process.cwd(), 'lib/auth/clientSessionValidation.ts'), 'utf8');
    expect(src).toContain('const { data: sess } = await supabase.auth.getSession()');
    expect(src).toMatch(/isInvalidStoredSessionError\(error\)[\s\S]*signOut/);
  });

  test('navigation bar validates session with getUser-backed helper', () => {
    const src = readFileSync(join(process.cwd(), 'components/NavigationBar.tsx'), 'utf8');
    expect(src).toContain('syncValidatedClientAuth');
    expect(src).not.toMatch(/getSession\(\)[\s\S]{0,80}setIsLoggedIn/);
  });

  test('self profile missing snapshot redirects expired sessions to login', () => {
    const src = readFileSync(join(process.cwd(), 'app/profile/[id]/page.tsx'), 'utf8');
    expect(src).toContain("router.replace('/login?reason=session_expired')");
    expect(src).toContain('syncValidatedClientAuth');
  });

  test('missing profile alone keeps a valid auth user signed in', () => {
    const src = readFileSync(join(process.cwd(), 'app/profile/[id]/page.tsx'), 'utf8');
    expect(src).toContain("setMessage('Profile not found.')");
    expect(src).toMatch(/if \(!user \|\| cleared\)[\s\S]*session_expired[\s\S]*setMessage\('Profile not found\.'\)/);
  });

  test('post-auth routing avoids redirect loops on username onboarding', () => {
    const src = readFileSync(join(process.cwd(), 'lib/loginPostAuthRoute.ts'), 'utf8');
    expect(src).toContain('conflict=signup_username');
    expect(src).not.toMatch(/while\s*\(/);
  });
});

test.describe('doctrine amendment', () => {
  test('administrative test identity exception is documented', () => {
    const src = readFileSync(
      join(process.cwd(), 'docs/doctrine/once-used-identity-recovery-doctrine.md'),
      'utf8',
    );
    expect(src).toContain('## 22A. Internal Administrative Test Identity Exception');
    expect(src).toContain('must **not** permanently burn');
    expect(src).toContain('internal test/audit record');
  });
});
