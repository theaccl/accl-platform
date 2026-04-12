'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ACCL_SHELL_CONTEXT_KEY, shellContextCardId } from '@/components/SwitchModeLink';
import { supabase } from '@/lib/supabaseClient';
import NavigationBar from '@/components/NavigationBar';

type ModeCardDef = {
  id: 'home' | 'free' | 'tournaments' | 'finished';
  href: string;
  label: string;
  description: string;
  variant: 'primary' | 'secondary';
};

const MODE_CARDS: ModeCardDef[] = [
  {
    id: 'home',
    href: '/',
    label: 'Home',
    description:
      'Primary entry at / : random queue, open seats, direct challenge, and quick game tools.',
    variant: 'primary',
  },
  {
    id: 'free',
    href: '/free',
    label: 'Free',
    description: 'Same free-play ecosystem with the classic free lobby layout and shortcuts.',
    variant: 'secondary',
  },
  {
    id: 'tournaments',
    href: '/tournaments',
    label: 'Tournaments',
    description: 'Bracket events: browse tournaments, open a bracket, and follow match progress.',
    variant: 'secondary',
  },
  {
    id: 'finished',
    href: '/finished',
    label: 'Finished',
    description:
      'Canonical completed-game archive — pick Free or Tournament filters on the hub.',
    variant: 'secondary',
  },
];

const btnPrimary =
  'inline-flex w-full items-center justify-center rounded-xl border border-red-500/45 bg-red-900/25 px-4 py-3.5 text-sm font-semibold text-red-100 shadow-sm transition hover:bg-red-900/40 hover:border-red-400/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111723]';
const btnSecondary =
  'inline-flex w-full items-center justify-center rounded-xl border border-[#2a3442] bg-[#151d2c] px-4 py-3.5 text-sm font-medium text-gray-100 transition hover:border-red-500/35 hover:bg-[#1a2435] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111723]';

function shellHintLabel(active: ReturnType<typeof shellContextCardId>): string | null {
  if (active === 'home') return 'You were just on Home (main lobby).';
  if (active === 'free') return 'You were just in Free play.';
  if (active === 'tournaments') return 'You were just in Tournaments.';
  if (active === 'finished') return 'You were just in Finished games.';
  if (active === 'profile') return 'You were just on Profile — pick a play area below.';
  if (active === 'vault') return 'You were just in Vault — pick a play area below.';
  return null;
}

function modesShell(children: React.ReactNode) {
  return (
    <div className="min-h-screen bg-[#0D1117] flex flex-col text-white">
      <NavigationBar />
      {children}
    </div>
  );
}

/** Canonical mode selector. Keeps routing at `/modes`; no gameplay or data logic here. */
export default function ModesPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [activeCard, setActiveCard] = useState<ReturnType<typeof shellContextCardId>>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(ACCL_SHELL_CONTEXT_KEY);
      setActiveCard(shellContextCardId(raw));
    } catch {
      setActiveCard(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;
      const uid = error ? null : (data.user?.id ?? null);
      setAuthUserId(uid);
      setAuthChecked(true);
      if (!uid) router.replace('/login');
    })();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      setAuthUserId(uid);
      if (!uid) router.replace('/login');
    });
    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  if (!authChecked || !authUserId) {
    return modesShell(
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <p className="text-sm text-gray-500">Loading…</p>
      </main>
    );
  }

  const hint = shellHintLabel(activeCard);

  return modesShell(
    <main
      data-testid="lobby-ready"
      className="flex-1 flex items-center justify-center px-4 py-12 sm:py-16"
    >
      <div className="w-full max-w-md">
        <section className="rounded-2xl border border-[#2a3442] bg-gradient-to-br from-[#111723] to-[#1a2231] shadow-lg shadow-black/20 p-8 w-full">
          <p className="text-[11px] uppercase tracking-[0.25em] text-gray-500 mb-2">ACCL</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight leading-snug">
            Switch Mode
          </h1>
          <p className="mt-3 text-gray-400 text-sm leading-relaxed">
            Quick jump between ACCL areas. This page stays at{' '}
            <code className="text-gray-300 text-[13px]">/modes</code> so you can always return here from{' '}
            <span className="text-gray-200 font-medium">Switch mode</span> in the nav.
          </p>
          {hint ? (
            <p
              data-testid="modes-context-hint"
              className="mt-5 rounded-xl border border-[#2a3442] bg-[#151d2c]/80 px-3.5 py-2.5 text-sm text-gray-300 leading-relaxed"
            >
              {hint}
            </p>
          ) : null}

          <div className="mt-8 space-y-5" data-testid="modes-card-list">
            {MODE_CARDS.map((card) => {
              const isActive = activeCard === card.id;
              const base = card.variant === 'primary' ? btnPrimary : btnSecondary;
              const activeRing = isActive
                ? card.variant === 'primary'
                  ? ' ring-2 ring-red-400/50 ring-offset-2 ring-offset-[#111723]'
                  : ' ring-2 ring-red-500/35 ring-offset-2 ring-offset-[#111723] border-red-400/40'
                : '';
              return (
                <div key={card.id}>
                  <Link
                    href={card.href}
                    data-testid={`modes-card-${card.id}`}
                    className={`${base}${activeRing}`}
                  >
                    <span>
                      {card.label}
                      {isActive ? (
                        <span className="ml-2 text-xs font-semibold text-red-200/90">· Last area</span>
                      ) : null}
                    </span>
                  </Link>
                  <p className="mt-2 text-xs text-gray-500 leading-relaxed pl-0.5">{card.description}</p>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
