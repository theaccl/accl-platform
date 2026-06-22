import {
  buildEmailConfirmationCallbackUrl,
  resolveTrustedEmailConfirmationOrigin,
} from '@/lib/emailConfirmationRedirect';
import { requiresEmailVerificationForProvisioning, type EmailVerificationUser } from '@/lib/emailVerificationGate';
import {
  resolvePostAuthRoute,
  type PostAuthRouteResult,
} from '@/lib/loginPostAuthRoute';
import {
  SIGNUP_ACTIVE_SESSION_MESSAGE,
  SIGNUP_VERIFICATION_PENDING_MESSAGE,
} from '@/lib/loginPageMode';
import {
  detectEmailTypoSuggestion,
  isTypoGateBlocking,
  normalizeEmailInput,
  validateEmailSyntax,
  type EmailTypoDecisionState,
} from '@/lib/emailIntegrity';
import { validateAcclUsername } from '@/lib/usernameRules';

export type SignInResult =
  | { ok: true; kind: 'redirect'; destination: string }
  | { ok: true; kind: 'verification_required'; email: string }
  | { ok: false; message: string };

export type SignUpOutcome = 'active_session' | 'confirmation_pending';

export type SignUpResult =
  | {
      ok: true;
      outcome: SignUpOutcome;
      message: string;
      destination?: string;
      pendingEmail?: string;
    }
  | {
      ok: false;
      message: string;
      reason?: 'invalid_email' | 'typo_unresolved' | 'provider_error';
    };

export type LoginAuthHandlerDeps = {
  signInWithPassword: (args: { email: string; password: string }) => Promise<{
    error: { message: string } | null;
    data: {
      session: { access_token: string } | null;
      user: EmailVerificationUser | null;
    };
  }>;
  signUp: (args: {
    email: string;
    password: string;
    options?: {
      data?: { username: string };
      emailRedirectTo?: string;
    };
  }) => Promise<{
    error: { message: string } | null;
    data: {
      session: { access_token: string } | null;
      user: EmailVerificationUser | null;
    };
  }>;
  auditLogin: (accessToken: string) => Promise<void>;
  resolvePostAuthRoute: (
    accessToken: string,
    nextParam: string | null,
    user?: EmailVerificationUser | null,
  ) => Promise<PostAuthRouteResult>;
};

const defaultDeps: LoginAuthHandlerDeps = {
  signInWithPassword: async () => ({
    error: { message: 'signInWithPassword not configured' },
    data: { session: null, user: null },
  }),
  signUp: async () => ({
    error: { message: 'signUp not configured' },
    data: { session: null, user: null },
  }),
  auditLogin: async () => {},
  resolvePostAuthRoute,
};


export async function performSignIn(
  input: { email: string; password: string; nextParam: string | null },
  deps: LoginAuthHandlerDeps = defaultDeps,
): Promise<SignInResult> {
  const normalized = normalizeEmailInput(input.email);
  const { error, data } = await deps.signInWithPassword({
    email: normalized,
    password: input.password,
  });
  if (error) {
    return { ok: false, message: error.message };
  }
  if (!data.session?.access_token) {
    return { ok: false, message: 'Sign-in failed. Try again.' };
  }
  if (data.user && requiresEmailVerificationForProvisioning(data.user)) {
    return { ok: true, kind: 'verification_required', email: data.user.email?.trim() || normalized };
  }
  try {
    await deps.auditLogin(data.session.access_token);
  } catch {
    /* non-blocking */
  }
  const route = await deps.resolvePostAuthRoute(
    data.session.access_token,
    input.nextParam,
    data.user,
  );
  if (route.status === 'verification_required') {
    return { ok: true, kind: 'verification_required', email: route.email || normalized };
  }
  return { ok: true, kind: 'redirect', destination: route.destination };
}

export async function performSignUp(
  input: {
    email: string;
    password: string;
    username: string;
    signupMode: boolean;
    nextParam: string | null;
    typoDecision: EmailTypoDecisionState | null;
    confirmationRedirectOrigin: string | null;
  },
  deps: LoginAuthHandlerDeps = defaultDeps,
): Promise<SignUpResult> {
  if (input.signupMode) {
    const syntax = validateEmailSyntax(input.email);
    if (!syntax.ok) {
      return { ok: false, message: syntax.error, reason: 'invalid_email' };
    }

    if (isTypoGateBlocking(syntax.email, input.typoDecision)) {
      const typo = detectEmailTypoSuggestion(syntax.email);
      return {
        ok: false,
        message: typo
          ? `Did you mean ${typo.suggested}? Confirm or choose to use your entered address.`
          : 'Confirm your email address before continuing.',
        reason: 'typo_unresolved',
      };
    }

    const uv = validateAcclUsername(input.username);
    if (!uv.ok) {
      return { ok: false, message: uv.error, reason: 'provider_error' };
    }

    const signUpOptions: {
      data: { username: string };
      emailRedirectTo?: string;
    } = { data: { username: uv.username } };

    const trustedOrigin = resolveTrustedEmailConfirmationOrigin({
      clientOrigin: input.confirmationRedirectOrigin,
    });
    signUpOptions.emailRedirectTo = buildEmailConfirmationCallbackUrl(
      input.nextParam,
      trustedOrigin,
    );

    const { error, data } = await deps.signUp({
      email: syntax.email,
      password: input.password,
      options: signUpOptions,
    });
    if (error) {
      return { ok: false, message: error.message, reason: 'provider_error' };
    }

    if (data.session?.access_token) {
      if (data.user && requiresEmailVerificationForProvisioning(data.user)) {
        return {
          ok: true,
          outcome: 'confirmation_pending',
          message: SIGNUP_VERIFICATION_PENDING_MESSAGE,
          pendingEmail: syntax.email,
        };
      }
      const route = await deps.resolvePostAuthRoute(
        data.session.access_token,
        input.nextParam,
        data.user,
      );
      if (route.status === 'verification_required') {
        return {
          ok: true,
          outcome: 'confirmation_pending',
          message: SIGNUP_VERIFICATION_PENDING_MESSAGE,
          pendingEmail: syntax.email,
        };
      }
      return {
        ok: true,
        outcome: 'active_session',
        message: SIGNUP_ACTIVE_SESSION_MESSAGE,
        destination: route.destination,
      };
    }

    return {
      ok: true,
      outcome: 'confirmation_pending',
      message: SIGNUP_VERIFICATION_PENDING_MESSAGE,
      pendingEmail: syntax.email,
    };
  }

  const syntax = validateEmailSyntax(input.email);
  if (!syntax.ok) {
    return { ok: false, message: syntax.error, reason: 'invalid_email' };
  }

  const signUpOptions: { emailRedirectTo?: string } = {};
  const trustedOrigin = resolveTrustedEmailConfirmationOrigin({
    clientOrigin: input.confirmationRedirectOrigin,
  });
  signUpOptions.emailRedirectTo = buildEmailConfirmationCallbackUrl(
    input.nextParam,
    trustedOrigin,
  );

  const { error } = await deps.signUp({
    email: syntax.email,
    password: input.password,
    options: signUpOptions,
  });
  if (error) {
    return { ok: false, message: error.message, reason: 'provider_error' };
  }
  return {
    ok: true,
    outcome: 'confirmation_pending',
    message: SIGNUP_VERIFICATION_PENDING_MESSAGE,
    pendingEmail: syntax.email,
  };
}
