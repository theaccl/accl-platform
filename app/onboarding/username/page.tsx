'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import NavigationBar from '@/components/NavigationBar';
import { getSafePostLoginRedirect } from '@/lib/nexus/nexusRouteHelpers';
import { supabase } from '@/lib/supabaseClient';
import { validateAcclUsername } from '@/lib/usernameRules';

const cardClass =
  'rounded-2xl border border-[#2a3442] bg-gradient-to-br from-[#111723] to-[#1a2231] shadow-lg shadow-black/20';

const inputClass =
  'w-full rounded-xl border border-[#2a3442] bg-[#151d2c] px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-red-500/40 focus:outline-none focus:ring-2 focus:ring-red-500/40';

function UsernameOnboardingInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextRaw = searchParams.get('next');
  const nextPath = getSafePostLoginRedirect(nextRaw);

  const [checked, setChecked] = useState(false);
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!sess.session?.access_token) {
        router.replace(`/login?next=${encodeURIComponent('/onboarding/username')}`);
        return;
      }
      const meta = sess.session.user?.user_metadata as Record<string, unknown> | undefined;
      const hint =
        typeof meta?.username === 'string' && meta.username.trim() ? meta.username.trim() : '';
      if (hint) setDraft(hint);

      const res = await fetch('/api/profile/onboarding-status', {
        headers: { Authorization: `Bearer ${sess.session.access_token}` },
      });
      const j = (await res.json()) as { needsUsername?: boolean };
      if (cancelled) return;
      if (!j.needsUsername) {
        router.replace(nextPath);
        return;
      }
      setChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, nextPath]);

  const submit = async () => {
    setBusy(true);
    setMessage('');
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) {
      setMessage('Session expired. Sign in again.');
      setBusy(false);
      return;
    }
    const res = await fetch('/api/profile/claim-username', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ username: draft }),
    });
    const j = (await res.json()) as { error?: string; ok?: boolean };
    setBusy(false);
    if (!res.ok) {
      setMessage(j.error ?? 'Could not save username.');
      return;
    }
    await supabase.auth.refreshSession();
    router.replace(nextPath);
  };

  if (!checked) {
    return (
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  const preview = validateAcclUsername(draft);

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-md">
        <div className={`${cardClass} p-8 w-full`}>
          <p className="text-[11px] uppercase tracking-[0.25em] text-gray-500 mb-2">ACCL</p>
          <h1 className="text-2xl font-bold text-white tracking-tight">Choose your username</h1>
          <p className="mt-3 text-gray-400 text-sm leading-relaxed">
            This is your public name across games, chat, and leaderboards. Letters, numbers, and underscores;
            3–20 characters; must start with a letter.
          </p>
          <div className="mt-8">
            <label htmlFor="accl-username" className="block text-xs font-medium text-gray-400 mb-1.5">
              Username
            </label>
            <input
              id="accl-username"
              data-testid="onboarding-username-input"
              type="text"
              autoComplete="username"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className={inputClass}
              placeholder="your_handle"
            />
          </div>
          {preview.ok ? (
            <p className="mt-2 text-xs text-emerald-400/90">Looks good: {preview.username}</p>
          ) : draft.trim() ? (
            <p className="mt-2 text-xs text-amber-200/90">{preview.error}</p>
          ) : null}
          <button
            type="button"
            data-testid="onboarding-username-submit"
            disabled={busy || !validateAcclUsername(draft).ok}
            onClick={() => void submit()}
            className="mt-6 w-full rounded-xl border border-red-500/45 bg-red-900/25 px-4 py-3.5 text-sm font-semibold text-red-100 shadow-sm transition hover:bg-red-900/40 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Continue'}
          </button>
          {message ? (
            <p className="mt-4 text-sm text-red-300" role="alert">
              {message}
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}

export default function UsernameOnboardingPage() {
  return (
    <div className="min-h-screen bg-[#0D1117] flex flex-col text-white [color-scheme:dark]">
      <NavigationBar />
      <Suspense
        fallback={
          <main className="flex-1 flex items-center justify-center px-4 py-12">
            <p className="text-sm text-gray-500">Loading…</p>
          </main>
        }
      >
        <UsernameOnboardingInner />
      </Suspense>
    </div>
  );
}
