'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { performSignIn, performSignUp } from '@/app/login/authHandlers';
import { resolvePostAuthRoute } from '@/lib/loginPostAuthRoute';
import {
  buildAuthPageHref,
  getAlternateModePrompt,
  getAuthPageHeading,
  getPasswordAutocomplete,
  getPrimarySubmitLabel,
  getPrimarySubmitTestId,
  resolveAuthFormMode,
} from '@/lib/loginPageMode';
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

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const mode = resolveAuthFormMode(searchParams.get('intent'));
  const signupMode = mode === 'signup';
  const nextParam = searchParams.get('next');

  const authDeps = {
    signInWithPassword: (args: { email: string; password: string }) =>
      supabase.auth.signInWithPassword(args),
    signUp: (args: {
      email: string;
      password: string;
      options?: { data?: { username: string } };
    }) => supabase.auth.signUp(args),
    auditLogin: async (accessToken: string) => {
      await fetch('/api/auth/audit-login', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    },
    resolvePostAuthRoute,
  };

  useEffect(() => {
    let cancelled = false;
    /** If Supabase is misconfigured or unreachable, `getUser()` can hang; still show the form for manual sign-in. */
    const showFormFallbackMs = 12_000;
    const showFormFallback = window.setTimeout(() => {
      if (!cancelled) setChecked(true);
    }, showFormFallbackMs);
    void (async () => {
      const { data } = await supabase.auth.getUser();
      window.clearTimeout(showFormFallback);
      if (cancelled) return;
      if (data.user?.id) {
        const { data: sess } = await supabase.auth.getSession();
        if (sess.session?.access_token) {
          const dest = await resolvePostAuthRoute(sess.session.access_token, nextParam);
          router.replace(dest);
        }
        return;
      }
      setChecked(true);
    })();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.id && session.access_token) {
        void (async () => {
          const dest = await resolvePostAuthRoute(session.access_token, nextParam);
          router.replace(dest);
        })();
      }
    });
    return () => {
      cancelled = true;
      window.clearTimeout(showFormFallback);
      listener.subscription.unsubscribe();
    };
  }, [router, nextParam]);

  const switchMode = (targetMode: 'login' | 'signup') => {
    if (busy) return;
    setMessage('');
    router.replace(buildAuthPageHref(targetMode, searchParams));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      if (signupMode) {
        const result = await performSignUp(
          {
            email,
            password,
            username: signupUsername,
            signupMode: true,
            nextParam,
          },
          authDeps,
        );
        if (!result.ok) {
          setMessage(result.message);
          setBusy(false);
          return;
        }
        setMessage(result.message);
        if (result.sessionCreated && result.destination) {
          router.replace(result.destination);
          return;
        }
        setBusy(false);
        return;
      }

      const result = await performSignIn({ email, password, nextParam }, authDeps);
      if (!result.ok) {
        setMessage(result.message);
        setBusy(false);
        return;
      }
      router.replace(result.destination);
      /* Keep busy until navigation replaces this view — avoids a dead-feeling gap after auth. */
    } catch (e) {
      setMessage(e instanceof Error ? e.message : signupMode ? 'Sign-up failed. Try again.' : 'Sign-in failed. Try again.');
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

          <form className="mt-8" onSubmit={handleSubmit} noValidate>
            <div className="space-y-4">
              <div>
                <label htmlFor="login-email" className="block text-xs font-medium text-gray-400 mb-1.5">
                  Email
                </label>
                <input
                  id="login-email"
                  data-testid="login-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
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
                    Username
                  </label>
                  <input
                    id="signup-username"
                    data-testid="signup-username"
                    type="text"
                    placeholder="your_public_name"
                    value={signupUsername}
                    onChange={(e) => setSignupUsername(e.target.value)}
                    autoComplete="username"
                    className={loginInputClass}
                    disabled={busy}
                  />
                  <p className="mt-1.5 text-[11px] text-gray-500 leading-relaxed">
                    Public identity (3–20 chars, letter then letters, numbers, underscores). Never your email.
                  </p>
                </div>
              ) : null}
            </div>

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

          {message ? (
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
