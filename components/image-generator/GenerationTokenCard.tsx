'use client';

import Link from 'next/link';
import { Coins, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import Flicker from '@/components/flicker';
import { GenerationTokenCoin } from '@/components/image-generator/GenerationTokenCoin';
import type { GeneratorMembershipTier, GeneratorTierContract } from '@/lib/imageGenerator/membership';
import { supabase } from '@/lib/supabaseClient';

type TokenSummary = {
  membership_tier?: GeneratorMembershipTier;
  generator_contract?: GeneratorTierContract;
  generation_tokens?: { balance: number | null; lifetime_earned: number; lifetime_spent: number; unlimited?: boolean };
};

type GenerationTokenCardProps = {
  compact?: boolean;
  actionHref?: string;
};

export function GenerationTokenCard({ compact = false, actionHref = '/image-generator' }: GenerationTokenCardProps) {
  const [summary, setSummary] = useState<TokenSummary | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token?.trim();
    setSignedIn(Boolean(token));
    if (!token) return;
    const response = await fetch('/api/image-generations/entitlements', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    if (response.ok) setSummary((await response.json()) as TokenSummary);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const balance = summary?.generation_tokens?.balance;
  const unlimited = summary?.generation_tokens?.unlimited === true;
  const contract = summary?.generator_contract;

  return (
    <section className="relative isolate overflow-hidden rounded-2xl border border-amber-300/20 bg-[linear-gradient(145deg,rgba(35,22,9,0.96),rgba(10,10,15,0.98))] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.34)]" aria-labelledby="generation-token-title">
      <Flicker className="-z-10 opacity-45" spacing={28} particleSize={1} colorPalette={['#d4a017', '#f7d76c', '#7c3aed']} glowColor="#f7d76c" overlay={0.74} overlayColor="#09080b" rate={0.35} flickerChance={0.35} />
      <div className={`relative flex ${compact ? 'items-center' : 'items-start'} gap-4`}>
        <GenerationTokenCoin size={compact ? 'sm' : 'md'} />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300/80">Vault currency</p>
          <h2 id="generation-token-title" className="mt-1 font-display text-xl font-bold text-white">ACCL Generation Tokens</h2>
          <p className="mt-1 text-sm text-white/60">One token opens one private image commission.</p>
        </div>
        <div className="rounded-xl border border-amber-200/15 bg-black/25 px-3 py-2 text-center">
          <p className="font-mono text-2xl font-bold tabular-nums text-amber-200">{unlimited ? '∞' : balance ?? (signedIn === false ? '—' : '0')}</p>
          <p className="text-[9px] uppercase tracking-[0.14em] text-white/40">Available</p>
        </div>
      </div>

      {!compact ? (
        <div className="relative mt-5 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-2">
          <div className="flex items-center gap-2 text-xs text-white/60"><Coins className="h-4 w-4 text-amber-300" aria-hidden />{unlimited ? 'Internal Unlimited tokens never decrease.' : 'Tokens remain in your Vault until used.'}</div>
          <div className="flex items-center gap-2 text-xs text-white/60"><Sparkles className="h-4 w-4 text-violet-300" aria-hidden />{contract ? `${contract.label}: ${contract.initialCandidates} opening choices` : 'Tier benefits appear after sign-in.'}</div>
        </div>
      ) : null}

      <div className="relative mt-4 flex justify-end">
        <Link href={signedIn === false ? '/login?next=/vault' : actionHref} className="inline-flex min-h-10 items-center rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 text-sm font-semibold text-amber-100 transition hover:border-amber-200/55 hover:bg-amber-300/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
          {signedIn === false ? 'Sign in to view Vault' : 'Use a token'}
        </Link>
      </div>
    </section>
  );
}
