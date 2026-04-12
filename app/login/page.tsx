'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { safeNextPath } from '@/lib/public/safeNextPath';
import { getStoredEntrySource, getStoredReferral } from '@/lib/public/referralTracking';
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

function loginShell(children: React.ReactNode) {
  return (
    <div className="min-h-screen bg-[#0D1117] flex flex-col text-white">
      <NavigationBar />
      {children}
    </div>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const intent = (searchParams.get('intent') ?? '').toLowerCase();
  const signupIntent = intent === 'signup';
  const nextPath = safeNextPath(searchParams.get('next')) ?? '/modes';

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
        if (sess.session?.access_token) void attachGrowthProfile(sess.session.access_token);
        router.replace(nextPath);
        return;
      }
      setChecked(true);
    })();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.id) {
        if (session.access_token) void attachGrowthProfile(session.access_token);
        router.replace(nextPath);
      }
    });
    return () => {
      cancelled = true;
      window.clearTimeout(showFormFallback);
      listener.subscription.unsubscribe();
    };
  }, [router, nextPath]);

  const signIn = async () => {
    setBusy(true);
    setMessage('');
    const { error, data } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    if (data.session?.access_token) void attachGrowthProfile(data.session.access_token);
    router.replace(nextPath);
  };

  const signUp = async () => {
    setBusy(true);
    setMessage('');
    const { error } = await supabase.auth.signUp({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage('Check your email to confirm signup, then sign in. After sign-in you will land on your chosen destination.');
  };

  if (!checked) {
    return loginShell(
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  return loginShell(
    <main className="flex-1 flex flex-col items-center justify-center px-4 py-10 sm:py-14">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-[#2a3442] bg-gradient-to-br from-[#111723] to-[#1a2231] px-6 py-8 sm:px-8 sm:py-10 shadow-lg shadow-black/20">
          <p className="text-[11px] uppercase tracking-[0.25em] text-gray-500 mb-2">ACCL</p>
          <h1 className="text-2xl sm:text-[1.65rem] font-bold text-white tracking-tight leading-snug">
            {signupIntent ? 'Create your ACCL account' : 'Sign in to ACCL'}
          </h1>
          <p className="mt-3 text-gray-400 text-sm leading-relaxed">
            Access Nexus, free play, tournaments, and progression.
          </p>

          <p className="mt-5 mb-6">
            <Link
              href="/modes"
              className="text-sm text-gray-500 hover:text-red-300/90 transition-colors underline-offset-4 hover:underline"
            >
              ← Mode selector
            </Link>
          </p>

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
                className="w-full rounded-xl border border-[#2a3442] bg-[#0f1420] px-3.5 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-red-500/40 focus:outline-none focus:ring-1 focus:ring-red-500/30"
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
                className="w-full rounded-xl border border-[#2a3442] bg-[#0f1420] px-3.5 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-red-500/40 focus:outline-none focus:ring-1 focus:ring-red-500/30"
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <button
              data-testid="login-submit"
              type="button"
              onClick={signIn}
              disabled={busy}
              className="inline-flex flex-1 items-center justify-center rounded-xl border border-red-500/45 bg-red-900/25 px-4 py-3 text-sm font-semibold text-red-100 shadow-sm transition hover:bg-red-900/40 hover:border-red-400/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111723] disabled:opacity-50 disabled:pointer-events-none"
            >
              {busy ? 'Please wait…' : 'Log in'}
            </button>
            <button
              type="button"
              onClick={signUp}
              disabled={busy}
              data-testid="signup-submit"
              className="inline-flex flex-1 items-center justify-center rounded-xl border border-[#2a3442] bg-[#151d2c] px-4 py-3 text-sm font-medium text-gray-100 transition hover:border-red-500/35 hover:bg-[#1a2435] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111723] disabled:opacity-50 disabled:pointer-events-none"
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
        <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
          <p className="text-sm text-gray-500">Loading…</p>
        </main>
      )}
    >
      <LoginPageInner />
    </Suspense>
  );
}
