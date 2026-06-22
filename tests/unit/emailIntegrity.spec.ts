import { expect, test } from '@playwright/test';

import {
  detectEmailTypoSuggestion,
  DOMAIN_TYPO_CORRECTIONS,
  formatTypoPrompt,
  isTypoGateBlocking,
  normalizeEmailInput,
  validateEmailSyntax,
} from '../../lib/emailIntegrity';
import { performSignUp, type LoginAuthHandlerDeps } from '../../app/login/authHandlers';
import {
  SIGNUP_ACTIVE_SESSION_MESSAGE,
  SIGNUP_VERIFICATION_PENDING_MESSAGE,
} from '../../lib/loginPageMode';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function confirmedUser(email = 'user@gmail.com') {
  return {
    email,
    email_confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'email' },
    identities: [{ provider: 'email' }],
  };
}

function makeDeps(overrides: Partial<LoginAuthHandlerDeps> = {}): LoginAuthHandlerDeps {
  return {
    signInWithPassword: async () => ({
      error: null,
      data: { session: { access_token: 'token' }, user: confirmedUser() },
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

test.describe('emailIntegrity normalization and syntax', () => {
  test('empty email rejected', () => {
    const result = validateEmailSyntax('');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('required');
  });

  test('missing @ rejected', () => {
    const result = validateEmailSyntax('userexample.com');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('@');
  });

  test('missing local part rejected', () => {
    const result = validateEmailSyntax('@example.com');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('before @');
  });

  test('missing domain rejected', () => {
    const result = validateEmailSyntax('user@');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('domain');
  });

  test('surrounding whitespace trimmed', () => {
    expect(normalizeEmailInput('  user@Example.COM  ')).toBe('user@example.com');
    const validated = validateEmailSyntax('  user@Example.COM  ');
    expect(validated.ok).toBe(true);
    if (validated.ok) expect(validated.email).toBe('user@example.com');
  });

  test('domain normalized to lowercase', () => {
    expect(normalizeEmailInput('User@GMAIL.COM')).toBe('User@gmail.com');
  });

  test('unfamiliar legitimate domains are not blocked', () => {
    const domains = [
      'user@school.k12.ca.us',
      'ops@agency.gov.uk',
      'dev@company-internal.example',
      'member@protonmail.ch',
    ];
    for (const address of domains) {
      const result = validateEmailSyntax(address);
      expect(result.ok, address).toBe(true);
      expect(detectEmailTypoSuggestion(result.ok ? result.email : address)).toBeNull();
    }
  });
});

test.describe('emailIntegrity typo suggestions', () => {
  test('production case suggests gmail.com correction', () => {
    const normalized = normalizeEmailInput('true.tester.1.2026@gmai.com');
    const typo = detectEmailTypoSuggestion(normalized);
    expect(typo).toEqual({
      entered: 'true.tester.1.2026@gmai.com',
      suggested: 'true.tester.1.2026@gmail.com',
      suggestedDomain: 'gmail.com',
    });
    expect(formatTypoPrompt(typo!)).toBe('Did you mean true.tester.1.2026@gmail.com?');
  });

  test('suggestion is never silently applied by normalizeEmailInput', () => {
    const raw = 'true.tester.1.2026@gmai.com';
    expect(normalizeEmailInput(raw)).toBe('true.tester.1.2026@gmai.com');
    expect(normalizeEmailInput(raw)).not.toContain('@gmail.com');
  });

  test('typo gate blocks until explicit decision scoped to the same email', () => {
    const email = 'user@gmai.com';
    expect(isTypoGateBlocking(email, null)).toBe(true);
    expect(isTypoGateBlocking(email, { email, decision: 'use_original' })).toBe(false);
    expect(isTypoGateBlocking(email, { email: 'other@gmai.com', decision: 'use_original' })).toBe(true);
  });

  test('use_original permits syntactically valid typo domain', () => {
    const email = 'user@gmai.com';
    expect(validateEmailSyntax(email).ok).toBe(true);
    expect(isTypoGateBlocking(email, { email, decision: 'use_original' })).toBe(false);
  });

  test('.co consumer domains are not auto-corrected to .com', () => {
    const coDomains = ['user@gmail.co', 'user@outlook.co', 'user@yahoo.co'];
    for (const address of coDomains) {
      const normalized = normalizeEmailInput(address);
      expect(detectEmailTypoSuggestion(normalized)).toBeNull();
      expect(validateEmailSyntax(address).ok).toBe(true);
    }
  });

  test('canonical domains do not produce suggestions', () => {
    expect(detectEmailTypoSuggestion('user@gmail.com')).toBeNull();
    expect(detectEmailTypoSuggestion('user@outlook.com')).toBeNull();
  });

  test('typo map covers required consumer domains only', () => {
    const canonical = new Set([
      'gmail.com',
      'outlook.com',
      'hotmail.com',
      'yahoo.com',
      'icloud.com',
      'proton.me',
      'protonmail.com',
    ]);
    for (const corrected of Object.values(DOMAIN_TYPO_CORRECTIONS)) {
      expect(canonical.has(corrected)).toBe(true);
    }
    expect(DOMAIN_TYPO_CORRECTIONS['gmai.com']).toBe('gmail.com');
  });
});

test.describe('emailIntegrity signup handler integration', () => {
  test('stale typo override does not apply to a different normalized email', async () => {
    let signUpCalls = 0;
    const deps = makeDeps({
      signUp: async () => {
        signUpCalls += 1;
        return { error: null, data: { session: null, user: null } };
      },
    });

    const result = await performSignUp(
      {
        email: 'user@outllok.com',
        password: 'secret',
        username: 'alice',
        signupMode: true,
        nextParam: null,
        typoDecision: { email: 'user@gmai.com', decision: 'use_original' },
        confirmationRedirectOrigin: null,
      },
      deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('typo_unresolved');
    expect(signUpCalls).toBe(0);
  });

  test('signup cannot call Supabase while typo decision is unresolved', async () => {
    let signUpCalls = 0;
    const deps = makeDeps({
      signUp: async () => {
        signUpCalls += 1;
        return { error: null, data: { session: null, user: null } };
      },
    });

    const result = await performSignUp(
      {
        email: 'user@gmai.com',
        password: 'secret',
        username: 'alice',
        signupMode: true,
        nextParam: null,
        typoDecision: null,
        confirmationRedirectOrigin: null,
      },
      deps,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('typo_unresolved');
    expect(signUpCalls).toBe(0);
  });

  test('immediate-session signup returns active_session outcome', async () => {
    const deps = makeDeps({
      signUp: async () => ({
        error: null,
        data: {
          session: { access_token: 'signup-token' },
          user: confirmedUser(),
        },
      }),
      resolvePostAuthRoute: async () => ({
        status: 'redirect',
        destination: '/onboarding/username',
      }),
    });

    const result = await performSignUp(
      {
        email: 'user@gmail.com',
        password: 'secret',
        username: 'alice',
        signupMode: true,
        nextParam: null,
        typoDecision: null,
        confirmationRedirectOrigin: null,
      },
      deps,
    );

    expect(result).toEqual({
      ok: true,
      outcome: 'active_session',
      message: SIGNUP_ACTIVE_SESSION_MESSAGE,
      destination: '/onboarding/username',
    });
    expect(result.ok && result.message).not.toBe(SIGNUP_VERIFICATION_PENDING_MESSAGE);
  });

  test('no-session signup returns confirmation_pending outcome', async () => {
    const deps = makeDeps({
      signUp: async () => ({ error: null, data: { session: null, user: null } }),
    });

    const result = await performSignUp(
      {
        email: 'user@gmail.com',
        password: 'secret',
        username: 'alice',
        signupMode: true,
        nextParam: null,
        typoDecision: null,
        confirmationRedirectOrigin: null,
      },
      deps,
    );

    expect(result).toEqual({
      ok: true,
      outcome: 'confirmation_pending',
      message: SIGNUP_VERIFICATION_PENDING_MESSAGE,
      pendingEmail: 'user@gmail.com',
    });
  });
});

test.describe('emailIntegrity login page structure', () => {
  test('accepting typo updates email in page source without auto submit', () => {
    const src = readFileSync(join(process.cwd(), 'app', 'login', 'page.tsx'), 'utf8');
    expect(src).toContain('data-testid="email-typo-accept"');
    const acceptFn = src.match(/const acceptTypoSuggestion = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? '';
    expect(acceptFn).toContain('setEmail(pendingTypo.suggested)');
    expect(acceptFn).not.toContain('performSignUp');
  });

  test('email change clears prior override state', () => {
    const src = readFileSync(join(process.cwd(), 'app', 'login', 'page.tsx'), 'utf8');
    expect(src).toContain('resetEmailIntegrityState');
    expect(src).toContain('handleEmailChange');
  });

  test('auth handlers do not log passwords or tokens', () => {
    const handlerSrc = readFileSync(join(process.cwd(), 'app', 'login', 'authHandlers.ts'), 'utf8');
    const pageSrc = readFileSync(join(process.cwd(), 'app', 'login', 'page.tsx'), 'utf8');
    expect(handlerSrc).not.toMatch(/console\.(log|info|warn|error)/);
    expect(pageSrc).not.toMatch(/console\.(log|info|warn|error)/);
  });
});
