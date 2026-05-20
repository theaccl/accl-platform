'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  isTournamentFieldReady,
  TOURNAMENT_FIELD_READY_MESSAGE,
  type TournamentFieldReadyRef,
} from '@/lib/tournamentSessionContinuity';
import { supabase } from '@/lib/supabaseClient';

function normId(v: unknown): string {
  return String(v ?? '').trim();
}

async function loadFieldReadyTournaments(userId: string): Promise<TournamentFieldReadyRef[]> {
  const { data: entries, error: eErr } = await supabase
    .from('tournament_entries')
    .select('tournament_id')
    .eq('user_id', userId)
    .eq('eliminated', false);

  if (eErr || !entries?.length) return [];

  const ids = [
    ...new Set(entries.map((e) => normId((e as { tournament_id?: string }).tournament_id)).filter(Boolean)),
  ];
  if (ids.length === 0) return [];

  const { data: tournaments, error: tErr } = await supabase
    .from('tournaments')
    .select('id, name, status')
    .in('id', ids)
    .eq('status', 'pending');

  if (tErr || !tournaments?.length) return [];

  const out: TournamentFieldReadyRef[] = [];
  for (const t of tournaments) {
    const tid = normId((t as { id?: string }).id);
    if (!tid) continue;
    const { count, error: cErr } = await supabase
      .from('tournament_entries')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tid);
    if (cErr) continue;
    const entrantCount = count ?? 0;
    if (!isTournamentFieldReady('pending', entrantCount)) continue;
    out.push({
      tournamentId: tid,
      tournamentName: String((t as { name?: string }).name ?? '').trim() || 'Tournament',
    });
  }
  return out;
}

/**
 * Shown while the entrant field is full and the host has not started the bracket yet.
 */
export function TournamentFieldReadyNotice() {
  const [rows, setRows] = useState<TournamentFieldReadyRef[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        if (!cancelled) setRows([]);
        return;
      }
      const loaded = await loadFieldReadyTournaments(uid);
      if (!cancelled) setRows(loaded);
    })();
    const poll = window.setInterval(() => {
      void (async () => {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth.user?.id;
        if (!uid) return;
        const loaded = await loadFieldReadyTournaments(uid);
        if (!cancelled) setRows(loaded);
      })();
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, []);

  if (rows === null || rows.length === 0) return null;
  const primary = rows[0]!;

  return (
    <div
      data-testid="tournament-field-ready-notice"
      className="mb-4 rounded-xl border-2 border-sky-500/45 bg-gradient-to-br from-sky-950/40 to-[#0f141c] px-4 py-3 text-sm text-sky-50"
      role="status"
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-200/90">
        {primary.tournamentName} — field full
      </p>
      <p className="mt-1 leading-snug text-sky-100/95">{TOURNAMENT_FIELD_READY_MESSAGE}</p>
      <p className="mt-3">
        <Link
          href={`/tournaments/${primary.tournamentId}`}
          data-testid="tournament-field-ready-hub-link"
          className="text-xs font-semibold text-sky-300 underline hover:text-sky-200"
        >
          Open tournament hub
        </Link>
        {rows.length > 1 ? (
          <span className="ml-2 text-xs text-sky-200/70">{rows.length} events ready to start</span>
        ) : null}
      </p>
    </div>
  );
}
