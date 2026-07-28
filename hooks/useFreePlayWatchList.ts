'use client';

import { useCallback, useContext, useEffect, useRef, useState } from 'react';

import { FreePlayLobbyGamesRealtimeContext } from '@/components/free/FreePlayLobbyGamesRealtimeProvider';
import type { PlatMode } from '@/lib/freePlayModeTimeControl';
import type { FreePlayWatchListRow } from '@/lib/server/freePlayWatchList';

type Payload = {
  byMode: Record<PlatMode, FreePlayWatchListRow[]>;
  watchActivity: Record<PlatMode, boolean>;
};

function lobbyGamesRtDebugEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_ACCL_LOBBY_GAMES_RT_DEBUG === '1') return true;
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage?.getItem('accl_lobby_games_rt_debug') === '1') return true;
  } catch {
    /* ignore */
  }
  return false;
}

export function useFreePlayWatchList(viewerEcosystem: 'adult' | 'k12' = 'adult'): {
  data: Payload | null;
  loading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lobbyRt = useContext(FreePlayLobbyGamesRealtimeContext);

  /** Bumps when `viewerEcosystem` changes so older responses cannot apply. */
  const seqRef = useRef(0);
  const inFlightRef = useRef(false);
  const pendingNotifyRef = useRef(false);
  const lastNotifyAtRef = useRef(0);

  const tryFetch = useCallback(async () => {
    if (inFlightRef.current) return;
    const mySeq = seqRef.current;
    inFlightRef.current = true;
    try {
      setError(null);
      try {
        const res = await fetch('/api/free-play/watch-list', {
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { 'x-accl-viewer-ecosystem': viewerEcosystem },
        });
        if (mySeq !== seqRef.current) return;
        if (!res.ok) {
          setData(null);
          setError('Could not load watch list.');
          return;
        }
        const j = (await res.json()) as Payload;
        if (mySeq !== seqRef.current) return;
        setData(j);
        if (lobbyGamesRtDebugEnabled() && process.env.NODE_ENV === 'development') {
          const n = (Object.keys(j.byMode) as PlatMode[]).reduce((a, m) => a + (j.byMode[m]?.length ?? 0), 0);
          console.debug('[free-play-watch-list] refetch', { rowsTotal: n, seq: mySeq });
        }
      } catch {
        if (mySeq !== seqRef.current) return;
        setData(null);
        setError('Could not load watch list.');
      }
    } finally {
      inFlightRef.current = false;
      if (mySeq === seqRef.current) {
        setLoading(false);
      }
      const stale = mySeq !== seqRef.current;
      const replayNotify = pendingNotifyRef.current;
      pendingNotifyRef.current = false;
      if (stale || replayNotify) {
        void tryFetch();
      }
    }
  }, [viewerEcosystem]);

  const requestEcosystemResync = useCallback(() => {
    seqRef.current += 1;
    setLoading(true);
    if (inFlightRef.current) {
      pendingNotifyRef.current = true;
      return;
    }
    void tryFetch();
  }, [tryFetch]);

  const requestNotifyResync = useCallback(() => {
    const now = Date.now();
    if (now - lastNotifyAtRef.current < 2_000) return;
    lastNotifyAtRef.current = now;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return;
    }
    if (inFlightRef.current) {
      pendingNotifyRef.current = true;
      return;
    }
    void tryFetch();
  }, [tryFetch]);

  useEffect(() => {
    requestEcosystemResync();
  }, [viewerEcosystem, requestEcosystemResync]);

  useEffect(() => {
    if (!lobbyRt) return;
    return lobbyRt.subscribe((_event) => {
      requestNotifyResync();
    });
  }, [lobbyRt, requestNotifyResync]);

  return { data, loading, error };
}
