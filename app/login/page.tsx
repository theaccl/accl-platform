'use client';

import { Suspense, useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { performSignIn, performSignUp } from '@/app/login/authHandlers';
import {
  detectEmailTypoSuggestion,
  formatTypoPrompt,
  isTypoGateBlocking,
  validateEmailSyntax,
  type EmailTypoDecisionState,
  type EmailTypoSuggestion,
} from '@/lib/emailIntegrity';
import type { EmailVerificationUser } from '@/lib/emailVerificationGate';
import { resolvePostAuthRoute } from '@/lib/loginPostAuthRoute';
import {
  buildAuthPageHref,
  EMAIL_CONFIRMATION_COMPLETE_MESSAGE,
  EMAIL_CONFIRMATION_COMPLETE_HEADING,
  EMAIL_CONFIRMATION_FAILED_MESSAGE,
  EMAIL_CONFIRMATION_MISSING_MESSAGE,
  getAlternateModePrompt,
  getAuthPageHeading,
  getLoginEmailAutocomplete,
  getPasswordAutocomplete,
  getPrimarySubmitLabel,
  getPrimarySubmitTestId,
  getSignupPublicHandleAutocomplete,
  resolveAuthFormMode,
  SESSION_EXPIRED_LOGIN_MESSAGE,
  USE_DIFFERENT_EMAIL_HINT,
  VERIFICATION_PENDING_HEADING,
} from '@/lib/loginPageMode';
import {
  clearPendingVerificationEmail,
  readPendingVerificationEmail,
  storePendingVerificationEmail,
} from '@/lib/loginVerificationStorage';
import { supabase } from '@/lib/supabaseClient';
import NavigationBar from '@/components/NavigationBar';

function loginShell(children: React.ReactNode) {
  return (
    <div className="min-h-screen bg-[#0D1117] flex flex-col text-white [color-scheme:dark]">
      <NavigationBar />
      {children}
    </div>
  );
}

/** Matches gateway hero card: border, gradient, shadow (app/page.tsx). */
const loginCardClass =
  'rounded-2xl border border-[#2a3442] bg-gradient-to-br from-[#111723] to-[#1a2231] shadow-lg shadow-black/20';

const loginInputClass =
  'w-full rounded-xl border border-[#2a3442] bg-[#151d2c] px-4 py-3 text-sm text-white placeholder:text-gray-500 appearance-none transition-colors focus:border-red-500/40 focus:outline-none focus:ring-2 focus:ring-red-500/40 focus:ring-offset-0 [&:-webkit-autofill]:[-webkit-text-fill-color:rgb(255,255,255)] [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_rgb(21,29,44)]';

const primarySubmitClass =
  'inline-flex w-full items-center justify-center rounded-xl border border-red-500/45 bg-red-900/25 px-4 py-3.5 text-sm font-semibold text-red-100 shadow-sm transition hover:bg-red-900/40 hover:border-red-400/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111723] disabled:opacity-50 disabled:pointer-events-none';

const secondaryActionClass =
  'inline-flex w-full items-center justify-center rounded-xl border border-[#2a3442] bg-[#151d2c] px-4 py-3 text-sm font-medium text-gray-200 transition hover:border-[#3a4658] hover:bg-[#1a2231] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 disabled:opacity-50 disabled:pointer-events-none';

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const [typoDecision, setTypoDecision] = useState<EmailTypoDecisionState | null>(null);
  const [pendingTypo, setPendingTypo] = useState<EmailTypoSuggestion | null>(null);
  const [showEmailReview, setShowEmailReview] = useState(false);
  const [reviewEmail, setReviewEmail] = useState('');
  const [verificationPendingEmail, setVerificationPendingEmail] = useState('');
  const [resendBusy, setResendBusy] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const mode = resolveAuthFormMode(searchParams.get('intent'));
  const signupMode = mode === 'signup';
  const nextParam = searchParams.get('next');
  const confirmationResult = searchParams.get('confirmation');
  const sessionExpired = searchParams.get('reason') === 'session_expired';
  const confirmationComplete = confirmationResult === 'complete';

  const authDeps = {
    signInWithPassword: (args: { email: string; password: string }) =>
      supabase.auth.signInWithPassword(args).then(({ data, error }) => ({
        error,
        data: {
          session: data.session,
          user: (data.user ?? null) as EmailVerificationUser | null,
        },
      })),
    signUp: (args: {
      email: string;
      password: string;
      options?: { data?: { username: string }; emailRedirectTo?: string };
    }) =>
      supabase.auth.signUp(args).then(({ data, error }) => ({
        error,
        data: {
          session: data.session,
          user: (data.user ?? null) as EmailVerificationUser | null,
        },
      })),
    auditLogin: async (accessToken: string) => {
      await fetch('/api/auth/audit-login', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    },
    resolvePostAuthRoute,
  };

  const resetEmailIntegrityState = () => {
    setTypoDecision(null);
    setPendingTypo(null);
    setShowEmailReview(false);
    setReviewEmail('');
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    resetEmailIntegrityState();
    setMessage('');
  };

  const showVerificationPending = useCallback((pendingEmail: string) => {
    const normalized = pendingEmail.trim();
    if (!normalized) return;
    storePendingVerificationEmail(normalized);
    setVerificationPendingEmail(normalized);
    setShowEmailReview(false);
    setReviewEmail('');
    setMessage('');
  }, []);

  const routeAuthenticatedSession = useCallback(async (
    accessToken: string,
    user: EmailVerificationUser | null | undefined,
  ) => {
    const route = await resolvePostAuthRoute(accessToken, nextParam, user ?? null);
    if (route.status === 'verification_required') {
      await supabase.auth.signOut({ scope: 'local' });
      showVerificationPending(route.email || user?.email?.trim() || '');
      setChecked(true);
      return;
    }
    router.replace(route.destination);
  }, [nextParam, router, showVerificationPending]);

  const restartSignupWithDifferentEmail = () => {
    clearPendingVerificationEmail();
    setVerificationPendingEmail('');
    setResendMessage('');
    setPassword('');
    setSignupUsername('');
    resetEmailIntegrityState();
    router.replace(buildAuthPageHref('signup', searchParams));
  };

  const handleResendConfirmation = async () => {
    if (resendBusy || !verificationPendingEmail) return;
    setResendBusy(true);
    setResendMessage('');
    try {
      const res = await fetch('/api/auth/resend-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verificationPendingEmail }),
      });
      const body = (await res.json()) as { message?: string; error?: string };
      if (res.status === 429) {
        setResendMessage('Please wait before requesting another confirmation email.');
      } else {
        setResendMessage(body.message ?? 'If this address needs confirmation, check your inbox.');
      }
    } catch {
      setResendMessage('Could not send a confirmation email right now. Try again shortly.');
    } finally {
      setResendBusy(false);
    }
  };

  useEffect(() => {
    const stored = readPendingVerificationEmail();
    if (stored) {
      setVerificationPendingEmail(stored);
    }
    if (confirmationResult === 'complete') {
      clearPendingVerificationEmail();
      setVerificationPendingEmail('');
      setMessage(EMAIL_CONFIRMATION_COMPLETE_MESSAGE);
    } else if (confirmationResult === 'failed') {
      setMessage(EMAIL_CONFIRMATION_FAILED_MESSAGE);
    } else if (confirmationResult === 'missing') {
      setMessage(EMAIL_CONFIRMATION_MISSING_MESSAGE);
    } else if (sessionExpired) {
      setMessage(SESSION_EXPIRED_LOGIN_MESSAGE);
    }
  }, [confirmationResult, sessionExpired]);

  useEffect(() => {
    let cancelled = false;
    /** If Supabase is misconfigured or unreachable, `getUser()` can hang; still show the form for manual sign-in. */
    const showFormFallbackMs = 12_000;
    const showFormFallback = window.setTimeout(() => {
      if (!cancelled) setChecked(true);
    }, showFormFallbackMs);
    void (async () => {
      if (confirmationComplete) {
        await supabase.auth.signOut({ scope: 'local' });
        if (!cancelled) setChecked(true);
        return;
      }
      const { data } = await supabase.auth.getUser();
      window.clearTimeout(showFormFallback);
      if (cancelled) return;
      if (data.user?.id) {
        const { data: sess } = await supabase.auth.getSession();
        if (sess.session?.access_token) {
          await routeAuthenticatedSession(sess.session.access_token, data.user);
        }
        return;
      }
      setChecked(true);
    })();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (confirmationComplete) return;
      if (session?.user?.id && session.access_token) {
        void routeAuthenticatedSession(session.access_token, session.user);
      }
    });
    return () => {
      cancelled = true;
      window.clearTimeout(showFormFallback);
      listener.subscription.unsubscribe();
    };
  }, [confirmationComplete, routeAuthenticatedSession]);

  const switchMode = (targetMode: 'login' | 'signup') => {
    if (busy) return;
    setMessage('');
    resetEmailIntegrityState();
    router.replace(buildAuthPageHref(targetMode, searchParams));
  };

  const acceptTypoSuggestion = () => {
    if (!pendingTypo) return;
    setEmail(pendingTypo.suggested);
    setTypoDecision({ email: pendingTypo.suggested, decision: 'accepted' });
    setPendingTypo(null);
    setShowEmailReview(false);
    setReviewEmail('');
    setMessage('');
  };

  const useOriginalEmailDespiteTypo = () => {
    if (!pendingTypo) return;
    setTypoDecision({ email: pendingTypo.entered, decision: 'use_original' });
    setPendingTypo(null);
    setShowEmailReview(false);
    setReviewEmail('');
    setMessage('');
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setMessage('');

    if (signupMode) {
      const syntax = validateEmailSyntax(email);
      if (!syntax.ok) {
        setMessage(syntax.error);
        return;
      }

      const normalized = syntax.email;
      if (email !== normalized) {
        setEmail(normalized);
      }

      if (isTypoGateBlocking(normalized, typoDecision)) {
        const typo = detectEmailTypoSuggestion(normalized);
        setPendingTypo(typo);
        return;
      }

      if (!showEmailReview) {
        setReviewEmail(normalized);
        setShowEmailReview(true);
        return;
      }

      setBusy(true);
      try {
        const result = await performSignUp(
          {
            email: normalized,
            password,
            username: signupUsername,
            signupMode: true,
            nextParam,
            typoDecision,
            confirmationRedirectOrigin:
              typeof window !== 'undefined' ? window.location.origin : null,
          },
          authDeps,
        );
        if (!result.ok) {
          if (result.reason === 'typo_unresolved') {
            const typo = detectEmailTypoSuggestion(normalized);
            setPendingTypo(typo);
          }
          setMessage(result.message);
          setBusy(false);
          return;
        }
        if (result.outcome === 'active_session' && result.destination) {
          router.replace(result.destination);
          return;
        }
        if (result.outcome === 'confirmation_pending') {
          await supabase.auth.signOut({ scope: 'local' });
          showVerificationPending(result.pendingEmail ?? normalized);
        }
        setMessage(result.message);
        setShowEmailReview(false);
        setBusy(false);
      } catch (e) {
        setMessage(e instanceof Error ? e.message : 'Sign-up failed. Try again.');
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    try {
      const result = await performSignIn({ email, password, nextParam }, authDeps);
      if (!result.ok) {
        setMessage(result.message);
        setBusy(false);
        return;
      }
      if (result.kind === 'verification_required') {
        await supabase.auth.signOut({ scope: 'local' });
        showVerificationPending(result.email);
        setBusy(false);
        return;
      }
      router.replace(result.destination);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Sign-in failed. Try again.');
      setBusy(false);
    }
  };

  const alternateMode = getAlternateModePrompt(mode);

  if (!checked) {
    return loginShell(
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  return loginShell(
    <main className="flex-1 flex items-center justify-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-md">
        <div className={`${loginCardClass} p-8 w-full`}>
          <p className="text-[11px] uppercase tracking-[0.25em] text-gray-500 mb-2">ACCL</p>
          <h1 className="text-2xl sm:text-[1.65rem] font-bold text-white tracking-tight leading-snug">
            {getAuthPageHeading(mode)}
          </h1>
          <p className="mt-3 text-gray-400 text-sm leading-relaxed">
            Access Nexus, free play, tournaments, and progression.
          </p>

          {verificationPendingEmail ? (
            <div
              className="mt-8 rounded-xl border border-[#2a3442] bg-[#151d2c]/80 px-4 py-5"
              data-testid="verification-pending-panel"
            >
              <h2 className="text-lg font-semibold text-white">{VERIFICATION_PENDING_HEADING}</h2>
              <p className="mt-3 text-sm text-gray-300 leading-relaxed">
                We sent a confirmation link to:
              </p>
              <p className="mt-2 text-sm text-white break-all" data-testid="verification-pending-email">
                {verificationPendingEmail}
              </p>
              <p className="mt-3 text-xs text-gray-400 leading-relaxed">
                Your account is not active until you confirm this email. Follow the link in your inbox, then sign in.
              </p>
              <button
                type="button"
                data-testid="verification-resend"
                disabled={resendBusy}
                onClick={() => void handleResendConfirmation()}
                className={`${primarySubmitClass} mt-5`}
              >
                {resendBusy ? 'Sending…' : 'Resend confirmation email'}
              </button>
              <button
                type="button"
                data-testid="verification-use-different-email"
                disabled={resendBusy || busy}
                onClick={restartSignupWithDifferentEmail}
                className={`${secondaryActionClass} mt-3`}
              >
                Use a different email
              </button>
              <p className="mt-3 text-[11px] text-gray-500 leading-relaxed">{USE_DIFFERENT_EMAIL_HINT}</p>
              {resendMessage ? (
                <p className="mt-4 text-sm text-gray-300" role="status">
                  {resendMessage}
                </p>
              ) : null}
            </div>
          ) : null}

          {confirmationComplete && !verificationPendingEmail ? (
            <div
              className="mt-8 rounded-xl border border-emerald-500/40 bg-emerald-950/25 px-4 py-5"
              data-testid="confirmation-complete-panel"
              role="status"
            >
              <h2 className="text-lg font-semibold text-emerald-100">{EMAIL_CONFIRMATION_COMPLETE_HEADING}</h2>
              <p className="mt-3 text-sm text-emerald-50/95 leading-relaxed">
                {EMAIL_CONFIRMATION_COMPLETE_MESSAGE}
              </p>
              <p className="mt-3 text-xs text-emerald-100/80 leading-relaxed">
                Enter the email and password for your account below to sign in.
              </p>
            </div>
          ) : null}

          {!verificationPendingEmail ? (
          <form className="mt-8" onSubmit={handleSubmit} noValidate>
            <div className="space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-xs font-medium text-gray-400 mb-1.5">
                  Email
                </label>
                <input
                  id="login-email"
                  data-testid="login-email"
                  name="accl-login-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  autoComplete={getLoginEmailAutocomplete()}
                  className={loginInputClass}
                  disabled={busy}
                />
              </div>
              <div>
                <label htmlFor="login-password" className="block text-xs font-medium text-gray-400 mb-1.5">
                  Password
                </label>
                <input
                  id="login-password"
                  data-testid="login-password"
                  name="accl-login-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={getPasswordAutocomplete(mode)}
                  className={loginInputClass}
                  disabled={busy}
                />
              </div>
              {signupMode ? (
                <div>
                  <label htmlFor="signup-username" className="block text-xs font-medium text-gray-400 mb-1.5">
                    Public username
                  </label>
                  <input
                    id="signup-username"
                    data-testid="signup-username"
                    name="accl-signup-public-handle"
                    type="text"
                    placeholder="your_public_name"
                    value={signupUsername}
                    onChange={(e) => setSignupUsername(e.target.value)}
                    autoComplete={getSignupPublicHandleAutocomplete()}
                    className={loginInputClass}
                    disabled={busy}
                  />
                  <p className="mt-1.5 text-[11px] text-gray-500 leading-relaxed">
                    Public identity (3–20 chars, letter then letters, numbers, underscores). Never your email.
                  </p>
                </div>
              ) : null}
            </div>

            {signupMode && pendingTypo ? (
              <div
                className="mt-6 rounded-xl border border-amber-500/35 bg-amber-950/20 px-4 py-4"
                data-testid="email-typo-warning"
                role="alert"
              >
                <p className="text-sm text-amber-100 leading-relaxed">{formatTypoPrompt(pendingTypo)}</p>
                <p className="mt-2 text-xs text-amber-200/80 leading-relaxed">
                  This is a suggestion only — we cannot guarantee the corrected address is yours.
                </p>
                <p className="mt-3 text-xs text-gray-400">
                  You entered: <span className="text-gray-200">{pendingTypo.entered}</span>
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  <button
                    type="button"
                    data-testid="email-typo-accept"
                    disabled={busy}
                    onClick={acceptTypoSuggestion}
                    className={primarySubmitClass}
                  >
                    Use {pendingTypo.suggested}
                  </button>
                  <button
                    type="button"
                    data-testid="email-typo-use-original"
                    disabled={busy}
                    onClick={useOriginalEmailDespiteTypo}
                    className={secondaryActionClass}
                  >
                    Use {pendingTypo.entered} anyway
                  </button>
                </div>
              </div>
            ) : null}

            {signupMode && showEmailReview && !pendingTypo ? (
              <div
                className="mt-6 rounded-xl border border-[#2a3442] bg-[#151d2c]/80 px-4 py-4"
                data-testid="signup-email-review"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Review email</p>
                <p className="mt-2 text-sm text-white break-all">{reviewEmail}</p>
                <p className="mt-2 text-xs text-gray-400 leading-relaxed">
                  This is the exact address we will use to create your account. Select Create account again to
                  continue.
                </p>
              </div>
            ) : null}

            <button
              type="submit"
              data-testid={getPrimarySubmitTestId(mode)}
              disabled={busy}
              className={`${primarySubmitClass} mt-6`}
            >
              {getPrimarySubmitLabel(mode, busy)}
            </button>

            <p className="mt-4 text-center text-sm text-gray-400">
              {alternateMode.lead}{' '}
              <button
                type="button"
                data-testid="auth-mode-switch"
                disabled={busy}
                onClick={() => switchMode(signupMode ? 'login' : 'signup')}
                className="font-medium text-red-200 underline-offset-2 transition hover:text-red-100 hover:underline disabled:opacity-50 disabled:pointer-events-none"
              >
                {alternateMode.action}
              </button>
            </p>
          </form>
          ) : null}

          {message && !(confirmationComplete && !verificationPendingEmail) ? (
            <p className="mt-5 text-sm text-gray-300 leading-relaxed" role="status">
              {message}
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={loginShell(
        <main className="flex-1 flex items-center justify-center px-4 py-12">
          <p className="text-sm text-gray-500">Loading…</p>
        </main>
      )}
    >
      <LoginPageInner />
    </Suspense>
  );
}
