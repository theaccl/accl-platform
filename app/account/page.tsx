'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import NavigationBar from '@/components/NavigationBar';
import { supabase } from '@/lib/supabaseClient';

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setUser(data.session?.user ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#0D1117] text-white">
      <NavigationBar />
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-8">
        <h1 className="text-2xl font-bold tracking-tight">Manage account</h1>
        <p className="text-sm text-gray-400">
          This screen is for account/login identity only. Public profile identity remains username-based on profile pages.
        </p>

        <section className="rounded-2xl border border-[#2a3442] bg-[#111723] p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">Account identity</h2>
          <p className="mt-3 text-sm text-gray-400">Sign-in email</p>
          <p className="font-mono text-base text-white">{user?.email ?? 'Not signed in'}</p>
        </section>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link href="/profile" className="text-sky-300 underline underline-offset-2">
            Back to profile
          </Link>
          <Link href="/onboarding/username" className="text-sky-300 underline underline-offset-2">
            Update username
          </Link>
        </div>
      </main>
    </div>
  );
}
