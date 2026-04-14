'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getSafePostLoginRedirect } from '@/lib/nexus/nexusRouteHelpers';
import { getStoredEntrySource, getStoredReferral } from '@/lib/public/referralTracking';
import { validateAcclUsername } from '@/lib/usernameRules';
import NavigationBar from '@/components/NavigationBar';

async function attachGrowthProfile(accessToken: string) {
  try {
    await fetch('/api/public/attach-growth-profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        referral_id: getStoredReferral() ?? undefined,
        entry_source: getStoredEntrySource(),
        conversion_event: 'session',
      }),
    });
  } catch {
    /* non-blocking */
  }
}

async function resolvePostAuthRoute(accessToken: string, nextParam: string | null): Promise<string> {
  await attachGrowthProfile(accessToken);
  const safe = getSafePostLoginRedirect(nextParam);
  const res = await fetch('/api/profile/onboarding-status', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const j = (await res.json()) as { needsUsername?: boolean };
  if (j.needsUsername) {
    return `/onboarding/username?next=${encodeURIComponent(safe)}`;
  }
  return safe;
}

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

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signupUsername, setSignupUsername] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const intent = (searchParams.get('intent') ?? '').toLowerCase();
  const signupIntent = intent === 'signup';

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
          const dest = await resolvePostAuthRoute(sess.session.access_token, searchParams.get('next'));
          router.replace(dest);
        }
        return;
      }
      setChecked(true);
    })();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.id && session.access_token) {
        void (async () => {
          const dest = await resolvePostAuthRoute(session.access_token, searchParams.get('next'));
          router.replace(dest);
        })();
      }
    });
    return () => {
      cancelled = true;
      window.clearTimeout(showFormFallback);
      listener.subscription.unsubscribe();
    };
  }, [router, searchParams]);

  const signIn = async () => {
    setBusy(true);
    setMessage('');
    const { error, data } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    if (data.session?.access_token) {
      try {
        await fetch('/api/auth/audit-login', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
          },
        });
      } catch {
        /* non-blocking */
      }
      const dest = await resolvePostAuthRoute(data.session.access_token, searchParams.get('next'));
      router.replace(dest);
    }
  };

  const signUp = async () => {
    setBusy(true);
    setMessage('');
    let signupData: { username: string } | undefined;
    if (signupIntent) {
      const uv = validateAcclUsername(signupUsername);
      if (!uv.ok) {
        setMessage(uv.error);
        setBusy(false);
        return;
      }
      signupData = { username: uv.username };
    }
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      ...(signupData ? { options: { data: signupData } } : {}),
    });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage('Check your email to confirm signup, then sign in. After sign-in you will land on your chosen destination.');
  };

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
            {signupIntent ? 'Create your ACCL account' : 'Sign in to ACCL'}
          </h1>
          <p className="mt-3 text-gray-400 text-sm leading-relaxed">
            Access Nexus, free play, tournaments, and progression.
          </p>

          <div className="mt-8 space-y-4">
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
                autoComplete={signupIntent ? 'new-password' : 'current-password'}
                className={loginInputClass}
              />
            </div>
            {signupIntent ? (
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
                />
                <p className="mt-1.5 text-[11px] text-gray-500 leading-relaxed">
                  Public identity (3–20 chars, letter then letters, numbers, underscores). Never your email.
                </p>
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <button
              data-testid="login-submit"
              type="button"
              onClick={signIn}
              disabled={busy}
              className="inline-flex flex-1 items-center justify-center rounded-xl border border-red-500/45 bg-red-900/25 px-4 py-3.5 text-sm font-semibold text-red-100 shadow-sm transition hover:bg-red-900/40 hover:border-red-400/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111723] disabled:opacity-50 disabled:pointer-events-none"
            >
              {busy ? 'Please wait…' : 'Log in'}
            </button>
            <button
              type="button"
              onClick={signUp}
              disabled={busy}
              data-testid="signup-submit"
              className="inline-flex flex-1 items-center justify-center rounded-xl border border-[#2a3442] bg-[#151d2c] px-4 py-3.5 text-sm font-medium text-gray-100 transition hover:border-red-500/35 hover:bg-[#1a2435] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111723] disabled:opacity-50 disabled:pointer-events-none"
            >
              Sign up
            </button>
          </div>

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
