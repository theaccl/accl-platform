import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { performSignIn, performSignUp, type LoginAuthHandlerDeps } from '../../app/login/authHandlers';
import {
  buildAuthPageHref,
  getPrimarySubmitLabel,
  getPrimarySubmitTestId,
  resolveAuthFormMode,
  resolveFormSubmitAction,
  SIGNUP_SUCCESS_MESSAGE,
} from '../../lib/loginPageMode';

function makeDeps(overrides: Partial<LoginAuthHandlerDeps> = {}): LoginAuthHandlerDeps {
  return {
    signInWithPassword: async () => ({
      error: null,
      data: { session: { access_token: 'login-token' } },
    }),
    signUp: async () => ({
      error: null,
      data: { session: null },
    }),
    auditLogin: async () => {},
    resolvePostAuthRoute: async () => '/profile',
    ...overrides,
  };
}

test.describe('loginPageMode', () => {
  test('intent=signup resolves signup mode', () => {
    expect(resolveAuthFormMode('signup')).toBe('signup');
    expect(resolveAuthFormMode('SIGNUP')).toBe('signup');
    expect(resolveAuthFormMode(null)).toBe('login');
    expect(resolveAuthFormMode('')).toBe('login');
  });

  test('signup mode primary action label is Create account or Sign up', () => {
    expect(getPrimarySubmitLabel('signup', false)).toBe('Create account');
    expect(getPrimarySubmitTestId('signup')).toBe('signup-submit');
  });

  test('login mode primary action label is Log in', () => {
    expect(getPrimarySubmitLabel('login', false)).toBe('Log in');
    expect(getPrimarySubmitTestId('login')).toBe('login-submit');
  });

  test('form submit action follows active mode only', () => {
    expect(resolveFormSubmitAction('signup')).toBe('signup');
    expect(resolveFormSubmitAction('login')).toBe('login');
  });

  test('buildAuthPageHref toggles intent consistently', () => {
    const withNext = new URLSearchParams('next=%2Fnexus');
    expect(buildAuthPageHref('signup', withNext)).toBe('/login?next=%2Fnexus&intent=signup');
    expect(buildAuthPageHref('login', new URLSearchParams('next=%2Fnexus&intent=signup'))).toBe(
      '/login?next=%2Fnexus',
    );
  });
});

test.describe('login auth handlers', () => {
  test('login-mode submission calls signInWithPassword only', async () => {
    let signInCalls = 0;
    let signUpCalls = 0;
    const deps = makeDeps({
      signInWithPassword: async () => {
        signInCalls += 1;
        return { error: null, data: { session: { access_token: 'token' } } };
      },
      signUp: async () => {
        signUpCalls += 1;
        return { error: null, data: { session: null } };
      },
      resolvePostAuthRoute: async () => '/profile',
    });

    const result = await performSignIn(
      { email: 'user@example.com', password: 'secret', nextParam: null },
      deps,
    );

    expect(result).toEqual({ ok: true, destination: '/profile' });
    expect(signInCalls).toBe(1);
    expect(signUpCalls).toBe(0);
  });

  test('signup-mode submission calls signUp only', async () => {
    let signInCalls = 0;
    let signUpCalls = 0;
    const deps = makeDeps({
      signInWithPassword: async () => {
        signInCalls += 1;
        return { error: null, data: { session: { access_token: 'token' } } };
      },
      signUp: async () => {
        signUpCalls += 1;
        return { error: null, data: { session: null } };
      },
    });

    const result = await performSignUp(
      {
        email: 'user@example.com',
        password: 'secret',
        username: 'alice',
        signupMode: true,
        nextParam: '/nexus',
      },
      deps,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toBe(SIGNUP_SUCCESS_MESSAGE);
      expect(result.sessionCreated).toBe(false);
    }
    expect(signInCalls).toBe(0);
    expect(signUpCalls).toBe(1);
  });

  test('signup with immediate session preserves post-auth continuation', async () => {
    const deps = makeDeps({
      signUp: async () => ({
        error: null,
        data: { session: { access_token: 'signup-token' } },
      }),
      resolvePostAuthRoute: async (_token, next) =>
        next ? `/onboarding/username?next=${encodeURIComponent('/nexus')}` : '/onboarding/username?next=%2Fprofile',
    });

    const result = await performSignUp(
      {
        email: 'user@example.com',
        password: 'secret',
        username: 'alice',
        signupMode: true,
        nextParam: '/nexus',
      },
      deps,
    );

    expect(result).toEqual({
      ok: true,
      message: SIGNUP_SUCCESS_MESSAGE,
      sessionCreated: true,
      destination: '/onboarding/username?next=%2Fnexus',
    });
  });

  test('signup-mode Enter/form path cannot call login because handler uses signUp only', async () => {
    let signInCalls = 0;
    const deps = makeDeps({
      signInWithPassword: async () => {
        signInCalls += 1;
        return { error: null, data: { session: { access_token: 'token' } } };
      },
    });

    await performSignUp(
      {
        email: 'user@example.com',
        password: 'secret',
        username: 'alice',
        signupMode: true,
        nextParam: null,
      },
      deps,
    );

    expect(signInCalls).toBe(0);
  });

  test('invalid username is rejected before signUp', async () => {
    let signUpCalls = 0;
    const deps = makeDeps({
      signUp: async () => {
        signUpCalls += 1;
        return { error: null, data: { session: null } };
      },
    });

    const result = await performSignUp(
      {
        email: 'user@example.com',
        password: 'secret',
        username: 'ab',
        signupMode: true,
        nextParam: null,
      },
      deps,
    );

    expect(result.ok).toBe(false);
    expect(signUpCalls).toBe(0);
  });

  test('login failure preserves generic provider message', async () => {
    const deps = makeDeps({
      signInWithPassword: async () => ({
        error: { message: 'Invalid login credentials' },
        data: { session: null },
      }),
    });

    const result = await performSignIn(
      { email: 'user@example.com', password: 'wrong', nextParam: null },
      deps,
    );

    expect(result).toEqual({ ok: false, message: 'Invalid login credentials' });
  });

  test('busy guard is enforced at page layer; handler remains single-shot per call', async () => {
    let signInCalls = 0;
    const deps = makeDeps({
      signInWithPassword: async () => {
        signInCalls += 1;
        return { error: null, data: { session: { access_token: 'token' } } };
      },
    });

    await performSignIn({ email: 'a@b.com', password: 'pw', nextParam: null }, deps);
    await performSignIn({ email: 'a@b.com', password: 'pw', nextParam: null }, deps);
    expect(signInCalls).toBe(2);
  });
});

test.describe('login page structure', () => {
  test('page has one submit control and a non-submit mode switch', () => {
    const src = readFileSync(join(process.cwd(), 'app', 'login', 'page.tsx'), 'utf8');
    expect(src).toContain('onSubmit={handleSubmit}');
    expect(src).toMatch(/type="submit"/);
    expect((src.match(/type="submit"/g) ?? []).length).toBe(1);
    expect(src).toContain('data-testid="auth-mode-switch"');
    expect(src).toContain('type="button"');
    expect(src).not.toContain("onClick={signIn}");
    expect(src).not.toContain("onClick={signUp}");
  });

  test('mode switch clears stale message before navigation', () => {
    const src = readFileSync(join(process.cwd(), 'app', 'login', 'page.tsx'), 'utf8');
    expect(src).toContain('setMessage(\'\')');
    expect(src).toContain('router.replace(buildAuthPageHref');
  });

  test('signup intent uses signup submit test id only', () => {
    const src = readFileSync(join(process.cwd(), 'app', 'login', 'page.tsx'), 'utf8');
    expect(src).toContain('getPrimarySubmitTestId(mode)');
    expect(src).not.toContain('data-testid="login-submit"');
    expect(src).not.toContain('data-testid="signup-submit"');
  });
});
