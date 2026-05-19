'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { GameContinuityGameRows } from '@/components/free/GameContinuityGameRows';
import {
  DAILY_ASYNC_SECTION_HINT,
  DAILY_ASYNC_SECTION_TITLE,
  GAME_CONTINUITY_ASYNC_ANCHOR,
  GAME_CONTINUITY_LIVE_ANCHOR,
  LIVE_NOW_SECTION_HINT,
  LIVE_NOW_SECTION_TITLE,
  partitionGamesByContinuity,
  type GameContinuityRow,
} from '@/lib/gameContinuityPresentation';
import { isLobbyNonFinishedGame } from '@/lib/freePlayLobby';
import { supabase } from '@/lib/supabaseClient';

function scrollToHashAnchor() {
  if (typeof window === 'undefined') return;
  const hash = window.location.hash.replace(/^#/, '');
  if (hash !== GAME_CONTINUITY_LIVE_ANCHOR && hash !== GAME_CONTINUITY_ASYNC_ANCHOR) return;
  const el = document.getElementById(hash);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/**
 * Full list at `/free/active` — live reconnect vs daily/async continuity in separate sections.
 */
export default function FreeActiveGamesList() {
  const [rows, setRows] = useState<GameContinuityRow[] | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id ?? null;
      if (!cancelled) setUid(userId);
      if (!userId) {
        if (!cancelled) setRows([]);
        return;
      }
      const { data, error } = await supabase
        .from('games')
        .select(
          'id,status,tempo,live_time_control,turn,white_player_id,black_player_id,created_at,updated_at',
        )
        .eq('play_context', 'free')
        .is('tournament_id', null)
        .or(`white_player_id.eq.${userId},black_player_id.eq.${userId}`)
        .in('status', ['active', 'waiting'])
        .order('updated_at', { ascending: false })
        .limit(50);
      if (cancelled) return;
      if (error) {
        setErr('Could not load games.');
        setRows([]);
        return;
      }
      const games = (data ?? []) as GameContinuityRow[];
      setRows(games.filter(isLobbyNonFinishedGame));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (rows === null) return;
    scrollToHashAnchor();
    const onHash = () => scrollToHashAnchor();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [rows]);

  const { live, dailyAsync } = useMemo(() => partitionGamesByContinuity(rows ?? []), [rows]);

  if (rows === null) {
    return <p className="text-sm text-gray-400">Loading…</p>;
  }
  if (err) {
    return <p className="text-sm text-red-400">{err}</p>;
  }
  if (rows.length === 0) {
    return <ActiveGamesEmptyState />;
  }

  return (
    <div className="space-y-8" data-testid="free-active-games-list">
      <section
        id={GAME_CONTINUITY_LIVE_ANCHOR}
        data-testid="free-active-live-now"
        className="scroll-mt-24 rounded-2xl border border-sky-500/35 bg-[#161b22] p-5"
      >
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-sky-300">{LIVE_NOW_SECTION_TITLE}</h2>
        <p className="mt-1 text-sm text-gray-500">{LIVE_NOW_SECTION_HINT}</p>
        {live.length === 0 ? (
          <p className="mt-4 text-sm text-gray-400">No live boards right now.</p>
        ) : (
          <div className="mt-4">
            <GameContinuityGameRows rows={live} uid={uid} variant="live" testIdPrefix="free-active-live" />
          </div>
        )}
      </section>

      <section
        id={GAME_CONTINUITY_ASYNC_ANCHOR}
        data-testid="free-active-daily-async"
        className="scroll-mt-24 rounded-2xl border border-violet-500/30 bg-[#161b22] p-5"
      >
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-violet-300">
          {DAILY_ASYNC_SECTION_TITLE}
        </h2>
        <p className="mt-1 text-sm text-gray-500">{DAILY_ASYNC_SECTION_HINT}</p>
        {dailyAsync.length === 0 ? (
          <p className="mt-4 text-sm text-gray-400">No daily or correspondence games waiting.</p>
        ) : (
          <div className="mt-4">
            <GameContinuityGameRows
              rows={dailyAsync}
              uid={uid}
              variant="async"
              testIdPrefix="free-active-async"
            />
          </div>
        )}
      </section>
    </div>
  );
}

function ActiveGamesEmptyState() {
  return (
    <div className="rounded-2xl border border-[#2a3442] bg-[#161b22] p-6">
      <p className="text-gray-300">No games on your list right now.</p>
      <p className="mt-2 text-sm text-gray-500">
        Start a live board from a mode room, or post a daily game — each type appears in its own section here.
      </p>
      <Link href="/free/lobby" className="mt-4 inline-block text-sm font-medium text-sky-400 hover:text-sky-300">
        Go to Lobby Chat
      </Link>
    </div>
  );
}
