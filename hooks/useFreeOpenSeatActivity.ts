'use client';

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { FreePlayLobbyGamesRealtimeContext } from '@/components/free/FreePlayLobbyGamesRealtimeProvider';
import type { PlatMode } from '@/lib/freePlayModeTimeControl';
import { platBucketForOpenSeat } from '@/lib/platOpenSeatBucket';
import { supabase } from '@/lib/supabaseClient';

const empty: Record<PlatMode, boolean> = {
  bullet: false,
  blitz: false,
  rapid: false,
  daily: false,
};

const emptyCounts: Record<PlatMode, number> = {
  bullet: 0,
  blitz: 0,
  rapid: 0,
  daily: 0,
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

/** Whether a public free-play open seat exists in each PLAT bucket, plus counts for hub badges. */
export function useFreeOpenSeatActivity(): {
  activity: Record<PlatMode, boolean>;
  counts: Record<PlatMode, number>;
  loading: boolean;
} {
  const [counts, setCounts] = useState<Record<PlatMode, number>>(emptyCounts);
  const [loading, setLoading] = useState(true);
  const lobbyRt = useContext(FreePlayLobbyGamesRealtimeContext);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const lastNotifyAtRef = useRef(0);

  const refetch = useCallback(async () => {
    if (inFlightRef.current) {
      pendingRef.current = true;
      return;
    }
    inFlightRef.current = true;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      inFlightRef.current = false;
      return;
    }
    const { data, error } = await supabase
      .from('games')
      .select('tempo,live_time_control')
      .eq('play_context', 'free')
      .is('tournament_id', null)
      .eq('status', 'active')
      .is('black_player_id', null);
    const next = { ...emptyCounts };
    if (!error && data?.length) {
      for (const row of data as { tempo: string | null; live_time_control: string | null }[]) {
        const m = platBucketForOpenSeat(row.tempo, row.live_time_control);
        if (m) next[m] += 1;
      }
    }
    setCounts(next);
    setLoading(false);
    if (lobbyGamesRtDebugEnabled() && process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.debug('[free-open-seat-activity] refetch', { totalRows: data?.length ?? 0, next });
    }
    inFlightRef.current = false;
    if (pendingRef.current) {
      pendingRef.current = false;
      void refetch();
    }
  }, []);

  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    setLoading(true);
    void refetchRef.current();
  }, [refetch]);

  useEffect(() => {
    if (!lobbyRt) return;
    return lobbyRt.subscribe((_event) => {
      const now = Date.now();
      if (now - lastNotifyAtRef.current < 1_500) return;
      lastNotifyAtRef.current = now;
      void refetchRef.current();
    });
  }, [lobbyRt]);

  const activity = useMemo(
    () =>
      (Object.keys(empty) as PlatMode[]).reduce(
        (acc, m) => {
          acc[m] = counts[m] > 0;
          return acc;
        },
        { ...empty },
      ),
    [counts],
  );

  return { activity, counts, loading };
}
