'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import NavigationBar from '@/components/NavigationBar';

function Inner() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next')?.trim() || '/tester/welcome';

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-12 text-white">
      <h1 className="text-xl font-semibold text-red-200">Account verification unavailable</h1>
      <p className="text-sm leading-relaxed text-gray-300">
        This environment cannot verify your player profile (server configuration or database access). Protected areas
        stay blocked until an operator fixes deployment settings (including Supabase service credentials).
      </p>
      <p className="text-xs text-gray-500">
        You are not signed out. After configuration is restored, use{' '}
        <Link href={`/onboarding/username?next=${encodeURIComponent(next)}`} className="text-sky-400 underline">
          complete username
        </Link>{' '}
        or return to{' '}
        <Link href="/" className="text-sky-400 underline">
          home
        </Link>
        .
      </p>
    </main>
  );
}

export default function ConfigurationRequiredPage() {
  return (
    <div className="min-h-screen bg-[#0D1117] flex flex-col [color-scheme:dark]">
      <NavigationBar />
      <Suspense
        fallback={
          <main className="mx-auto px-4 py-12 text-gray-400">
            <p className="text-sm">Loading…</p>
          </main>
        }
      >
        <Inner />
      </Suspense>
    </div>
  );
}
