'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  isLobbyNonFinishedGame,
  partitionNonFinishedLobbyGames,
} from '@/lib/freePlayLobby';
import { runFreePlayCreateGame, runFreePlayFindMatchAutomatic } from '@/lib/freePlayFindMatch';
import {
  coercePlatTimeForMode,
  defaultPlatTimeControl,
  type PlatMode,
} from '@/lib/freePlayModeTimeControl';
import { supabase } from '@/lib/supabaseClient';

type LobbyRow = {
  id: string;
  status: string;
  white_player_id: string;
  black_player_id: string | null;
  created_at?: string;
};

export type HomePlaySectionProps = {
  mode?: PlatMode;
  clock?: string;
  rated?: boolean;
};

/**
 * Find Match (same queue semantics as free lobby) + resume link for seated in-progress games.
 * Rendered on /free (Nexus-owned gameplay surface). Not on Home (/).
 * TEST CONTRACT: `data-testid="home-find-match"` — Playwright/E2E depend on it; do not rename or remove.
 */
export function HomePlaySection({
  mode = 'blitz',
  clock: clockProp,
  rated = true,
}: HomePlaySectionProps) {
  const router = useRouter();
  const [busyCreate, setBusyCreate] = useState(false);
  const [busyFind, setBusyFind] = useState(false);
  const [recovery, setRecovery] = useState<{ id: string } | null>(null);
  const [message, setMessage] = useState('');
  const [suggestCreate, setSuggestCreate] = useState(false);
  const busy = busyCreate || busyFind;

  const clock = clockProp ?? defaultPlatTimeControl(mode);
  const effectiveClock = coercePlatTimeForMode(mode, clock);

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

  const handleQueueResult = useCallback(
    (res: { gameId: string } | { error: string; resumeGameId?: string; suggestCreate?: boolean }) => {
      if ('error' in res) {
        if ('resumeGameId' in res && res.resumeGameId) {
          router.push(`/game/${res.resumeGameId}`);
          return;
        }
        setSuggestCreate(Boolean(res.suggestCreate));
        setMessage(res.error);
        return;
      }
      setSuggestCreate(false);
      router.push(`/game/${res.gameId}`);
    },
    [router]
  );

  const createGame = useCallback(async () => {
    if (busy) return;
    setMessage('');
    setSuggestCreate(false);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setMessage('Sign in to use the queue.');
      return;
    }
    setBusyCreate(true);
    try {
      const res = await runFreePlayCreateGame(supabase, {
        userId: auth.user.id,
        mode,
        clock: effectiveClock,
        rated,
      });
      handleQueueResult(res);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusyCreate(false);
    }
  }, [busy, mode, effectiveClock, rated, handleQueueResult]);

  const findMatchAutomatic = useCallback(async () => {
    if (busy) return;
    setMessage('');
    setSuggestCreate(false);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setMessage('Sign in to use the queue.');
      return;
    }
    setBusyFind(true);
    try {
      const res = await runFreePlayFindMatchAutomatic(supabase, {
        userId: auth.user.id,
        mode,
        clock: effectiveClock,
        rated,
      });
      handleQueueResult(res);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusyFind(false);
    }
  }, [busy, mode, effectiveClock, rated, handleQueueResult]);

  return (
    <div className="flex w-full max-w-md flex-col gap-3">
      {message ? (
        <div className="space-y-1" role="status">
          <p className={`text-sm ${suggestCreate ? 'text-amber-200/95' : 'text-red-300'}`}>{message}</p>
          {suggestCreate ? (
            <p className="text-xs text-gray-500">
              Use <span className="font-medium text-gray-400">Create game</span> to post an open seat.
            </p>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        data-testid="home-create-game"
        disabled={busy}
        onClick={() => void createGame()}
        className="inline-flex min-h-[48px] w-full touch-manipulation items-center justify-center rounded-xl border border-[#2a3442] bg-[#151d2c] px-4 py-3.5 text-sm font-semibold text-gray-100 transition hover:border-red-500/35 hover:bg-[#1a2435] focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 disabled:opacity-60"
      >
        {busyCreate ? 'Posting…' : 'Create game'}
      </button>
      <button
        type="button"
        data-testid="home-find-match"
        disabled={busy}
        onClick={() => void findMatchAutomatic()}
        className="inline-flex min-h-[48px] w-full touch-manipulation items-center justify-center rounded-xl border border-[#2a3442] bg-[#0d1117] px-4 py-3.5 text-sm font-semibold text-gray-100 transition hover:border-sky-500/35 hover:bg-[#141a22] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 disabled:opacity-60"
      >
        {busyFind ? 'Matching…' : 'Find match'}
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
