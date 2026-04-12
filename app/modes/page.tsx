'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ACCL_SHELL_CONTEXT_KEY, shellContextCardId } from '@/components/SwitchModeLink';
import { supabase } from '@/lib/supabaseClient';

type ModeCardDef = {
  id: 'home' | 'free' | 'tournaments' | 'finished';
  href: string;
  title: string;
  description: string;
  borderColor: string;
  background: string;
  fontWeight: 600 | 700;
};

const MODE_CARDS: ModeCardDef[] = [
  {
    id: 'home',
    href: '/',
    title: 'Home — main play lobby',
    description: 'Primary entry at / : random queue, open seats, direct challenge, and quick game tools.',
    borderColor: '#22c55e',
    background: '#14532d',
    fontWeight: 700,
  },
  {
    id: 'free',
    href: '/free',
    title: 'Free — alternate lobby',
    description: 'Same free-play ecosystem with the classic free lobby layout and shortcuts.',
    borderColor: '#3b82f6',
    background: '#1d4ed8',
    fontWeight: 700,
  },
  {
    id: 'tournaments',
    href: '/tournaments',
    title: 'Tournaments',
    description: 'Bracket events: browse tournaments, open a bracket, and follow match progress.',
    borderColor: '#a855f7',
    background: '#581c87',
    fontWeight: 600,
  },
  {
    id: 'finished',
    href: '/finished',
    title: 'Finished games',
    description: 'Canonical completed-game archive — pick Free or Tournament filters on the hub.',
    borderColor: '#155e75',
    background: '#0e7490',
    fontWeight: 700,
  },
];

function shellHintLabel(active: ReturnType<typeof shellContextCardId>): string | null {
  if (active === 'home') return 'You were just on Home (main lobby).';
  if (active === 'free') return 'You were just in Free play.';
  if (active === 'tournaments') return 'You were just in Tournaments.';
  if (active === 'finished') return 'You were just in Finished games.';
  if (active === 'profile') return 'You were just on Profile — pick a play area below.';
  if (active === 'vault') return 'You were just in Vault — pick a play area below.';
  return null;
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
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <p>Loading…</p>
      </main>
    );
  }

  const hint = shellHintLabel(activeCard);

  return (
    <main
      data-testid="lobby-ready"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0b0b0b',
        color: '#f5f5f5',
        padding: 24,
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 520,
          border: '1px solid #2f2f2f',
          borderRadius: 10,
          background: '#141414',
          padding: 22,
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: 6, fontSize: 26 }}>Switch mode</h1>
        <p style={{ marginTop: 0, marginBottom: 14, color: '#a3a3a3', fontSize: 14, lineHeight: 1.5 }}>
          Quick jump between ACCL areas. This page stays at <code style={{ color: '#e5e5e5' }}>/modes</code> so you
          can always return here from <strong style={{ color: '#fde047' }}>Switch mode</strong> in the nav.
        </p>
        {hint ? (
          <p
            data-testid="modes-context-hint"
            style={{
              margin: '0 0 16px 0',
              padding: '10px 12px',
              borderRadius: 8,
              background: '#1c1917',
              border: '1px solid #44403c',
              fontSize: 13,
              color: '#d6d3d1',
            }}
          >
            {hint}
          </p>
        ) : null}

        <div style={{ display: 'grid', gap: 14 }} data-testid="modes-card-list">
          {MODE_CARDS.map((card) => {
            const isActive = activeCard === card.id;
            return (
              <div key={card.id}>
                <Link
                  href={card.href}
                  data-testid={`modes-card-${card.id}`}
                  style={{
                    display: 'block',
                    padding: '14px 16px',
                    borderRadius: 8,
                    border: `2px solid ${isActive ? '#fef08a' : card.borderColor}`,
                    background: card.background,
                    color: '#fff',
                    textDecoration: 'none',
                    fontWeight: card.fontWeight,
                    boxShadow: isActive ? '0 0 0 2px rgba(253, 224, 71, 0.35)' : undefined,
                  }}
                >
                  {card.title}
                  {isActive ? (
                    <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, opacity: 0.95 }}>
                      · Last area
                    </span>
                  ) : null}
                </Link>
                <p style={{ margin: '6px 0 0 0', fontSize: 12, color: '#a3a3a3', lineHeight: 1.45, paddingLeft: 4 }}>
                  {card.description}
                </p>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
