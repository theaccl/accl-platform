'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  isLobbyNonFinishedGame,
  partitionNonFinishedLobbyGames,
} from '@/lib/freePlayLobby';
import { runFreePlayFindMatch } from '@/lib/freePlayFindMatch';
import { supabase } from '@/lib/supabaseClient';

type LobbyRow = {
  id: string;
  status: string;
  white_player_id: string;
  black_player_id: string | null;
  created_at?: string;
};

/**
 * Find Match (same queue semantics as free lobby) + resume link for seated in-progress games.
 * Rendered on /free (Nexus-owned gameplay surface). Not on Home (/).
 * TEST CONTRACT: `data-testid="home-find-match"` — Playwright/E2E depend on it; do not rename or remove.
 */
export function HomePlaySection() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState<{ id: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) return;
      const { data: rows } = await supabase
        .from('games')
        .select('id,status,white_player_id,black_player_id,created_at')
        .or(`white_player_id.eq.${uid},black_player_id.eq.${uid}`)
        .order('created_at', { ascending: false })
        .limit(30);
      if (cancelled || !rows?.length) return;
      const games = rows as LobbyRow[];
      const nonFin = games.filter(isLobbyNonFinishedGame);
      const p = partitionNonFinishedLobbyGames(nonFin);
      if (p.canonicalSeated) {
        setRecovery({ id: p.canonicalSeated.id });
      } else {
        setRecovery(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const findMatch = useCallback(async () => {
    if (busy) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    setBusy(true);
    try {
      const res = await runFreePlayFindMatch(supabase, {
        userId: auth.user.id,
        mode: 'blitz',
        clock: '3m',
        rated: true,
      });
      if ('error' in res) {
        return;
      }
      router.push(`/game/${res.gameId}`);
    } finally {
      setBusy(false);
    }
  }, [busy, router]);

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      <button
        type="button"
        data-testid="home-find-match"
        disabled={busy}
        onClick={() => void findMatch()}
        className="inline-flex w-full items-center justify-center rounded-xl border border-[#2a3442] bg-[#151d2c] px-4 py-3.5 text-sm font-semibold text-gray-100 transition hover:border-red-500/35 hover:bg-[#1a2435] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 disabled:opacity-60"
      >
        {busy ? 'Starting…' : 'Find match'}
      </button>
      {recovery ? (
        <div data-testid="home-active-game-recovery">
          <Link
            href={`/game/${recovery.id}`}
            className="text-sm font-medium text-sky-400 underline underline-offset-2 hover:text-sky-300"
          >
            Resume active game
          </Link>
        </div>
      ) : null}
    </div>
  );
}
