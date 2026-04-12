'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { safeNextPath } from '@/lib/public/safeNextPath';
import { getStoredEntrySource, getStoredReferral } from '@/lib/public/referralTracking';

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
    return (
      <main style={{ padding: 24, minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <p>Loading…</p>
      </main>
    );
  }

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 420,
        margin: '0 auto',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <h1 style={{ marginTop: 0 }}>{signupIntent ? 'Create account' : 'Sign in'}</h1>
      <p style={{ opacity: 0.85 }}>
        <Link href="/modes">← Mode selector</Link>
      </p>
      <input
        data-testid="login-email"
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ display: 'block', marginBottom: 10, padding: 12, borderRadius: 8 }}
      />
      <input
        data-testid="login-password"
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ display: 'block', marginBottom: 14, padding: 12, borderRadius: 8 }}
      />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button data-testid="login-submit" type="button" onClick={signIn} disabled={busy}>
          {busy ? 'Please wait…' : 'Log in'}
        </button>
        <button type="button" onClick={signUp} disabled={busy} data-testid="signup-submit">
          Sign up
        </button>
      </div>
      {message ? <p style={{ marginTop: 16 }}>{message}</p> : null}
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main style={{ padding: 24, minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
          <p>Loading…</p>
        </main>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}
