'use client';

import Image from 'next/image';
import { GitBranch, Images, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import type { GeneratorMembershipTier } from '@/lib/imageGenerator/membership';
import { supabase } from '@/lib/supabaseClient';

type SavedCreation = {
  id: string;
  candidate_id: string;
  generation_request_id: string;
  parent_creation_id: string | null;
  root_creation_id: string | null;
  created_at: string;
  url?: string;
};

function idempotencyKey(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `saved-creation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function SavedCreationsCard() {
  const [creations, setCreations] = useState<SavedCreation[]>([]);
  const [tier, setTier] = useState<GeneratorMembershipTier>('free');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [guidance, setGuidance] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token?.trim();
    if (!token) return;
    const [creationsResponse, entitlementResponse] = await Promise.all([
      fetch('/api/saved-creations', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }),
      fetch('/api/image-generations/entitlements', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }),
    ]);
    if (!creationsResponse.ok) return;
    const payload = (await creationsResponse.json()) as { creations?: SavedCreation[] };
    const visible = (payload.creations ?? []).slice(0, 6);
    const withUrls = await Promise.all(
      visible.map(async (creation) => {
        const access = await fetch(
          `/api/image-generations/${creation.generation_request_id}/candidates/${creation.candidate_id}/access`,
          { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
        );
        if (!access.ok) return creation;
        const accessPayload = (await access.json()) as { url?: string };
        return { ...creation, url: accessPayload.url };
      })
    );
    setCreations(withUrls);
    if (entitlementResponse.ok) {
      const entitlement = (await entitlementResponse.json()) as { membership_tier?: GeneratorMembershipTier };
      setTier(entitlement.membership_tier ?? 'free');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const furtherCreation = async () => {
    const cleanGuidance = guidance.trim();
    if (!selectedId || !cleanGuidance || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token?.trim();
      if (!token) throw new Error('Sign in again to further this creation.');
      const response = await fetch(`/api/saved-creations/${selectedId}/further`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey(),
        },
        body: JSON.stringify({ prompt: cleanGuidance, reference_ids: [] }),
      });
      const payload = (await response.json()) as { generation?: { id?: string }; error?: string };
      if (!response.ok || !payload.generation?.id) {
        throw new Error(payload.error ?? 'Could not further this creation.');
      }
      window.location.assign(`/image-generator?generation=${payload.generation.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not further this creation.');
    } finally {
      setBusy(false);
    }
  };

  if (creations.length === 0) return null;
  const canFurther = tier === 'pro' || tier === 'internal_unlimited';

  return (
    <section className="rounded-2xl border border-violet-300/20 bg-[linear-gradient(145deg,rgba(28,18,48,0.95),rgba(9,10,16,0.98))] p-5" aria-labelledby="saved-creations-title">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-violet-400/10 text-violet-200"><Images className="h-5 w-5" aria-hidden /></div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-200/75">Private collection</p>
          <h2 id="saved-creations-title" className="mt-1 font-display text-xl font-bold text-white">Saved Creations</h2>
          <p className="mt-1 text-sm text-white/55">Accepted identities remain private, restorable, and connected to their artistic lineage.</p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {creations.map((creation, index) => (
          <article key={creation.id} className={`overflow-hidden rounded-xl border bg-black/25 ${selectedId === creation.id ? 'border-violet-300/60' : 'border-white/10'}`}>
            <div className="relative aspect-square bg-black/30">
              {creation.url ? <Image src={creation.url} alt={`Saved creation ${index + 1}`} fill sizes="(max-width: 640px) 50vw, 220px" unoptimized className="object-cover" /> : null}
              {creation.parent_creation_id ? <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[9px] uppercase tracking-wider text-violet-100"><GitBranch className="h-3 w-3" aria-hidden /> Evolved</span> : null}
            </div>
            <button type="button" disabled={!canFurther} onClick={() => { setSelectedId(creation.id); setGuidance(''); setMessage(null); }} className="min-h-10 w-full px-2 text-xs font-semibold text-violet-100 hover:bg-violet-400/10 disabled:cursor-not-allowed disabled:text-white/30">{canFurther ? 'Further This Creation' : 'Pro evolution'}</button>
          </article>
        ))}
      </div>

      {selectedId && canFurther ? (
        <div className="mt-4 rounded-xl border border-violet-300/20 bg-black/20 p-4">
          <label htmlFor="saved-creation-guidance" className="text-sm font-semibold text-white">How should this identity evolve?</label>
          <textarea id="saved-creation-guidance" value={guidance} onChange={(event) => setGuidance(event.target.value)} maxLength={2000} rows={3} className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-violet-300/50" placeholder="Preserve the identity, then describe the new direction…" />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void furtherCreation()} disabled={busy || guidance.trim().length === 0} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-violet-300 px-4 text-sm font-bold text-violet-950 disabled:opacity-45"><Sparkles className="h-4 w-4" aria-hidden />{busy ? 'Opening branch…' : 'Spend 1 token and further'}</button>
            <button type="button" onClick={() => { setSelectedId(null); setGuidance(''); }} disabled={busy} className="min-h-10 rounded-lg px-3 text-sm text-white/55 hover:text-white disabled:opacity-45">Cancel</button>
          </div>
        </div>
      ) : null}
      {message ? <p className="mt-3 text-sm text-amber-200" role="status">{message}</p> : null}
    </section>
  );
}
