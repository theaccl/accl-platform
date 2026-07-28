'use client';

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { FreePlayLobbyGamesRealtimeContext } from '@/components/free/FreePlayLobbyGamesRealtimeProvider';
import { fetchPublicOpenSeatLobbyInventory } from '@/lib/fetchPublicOpenSeatLobbyInventory';
import { applyHubInventoryResult } from '@/lib/freeLobbyOpenSeatListController';
import { countPublicVisibleOpenSeatsByPlatMode } from '@/lib/freeLobbyOpenSeatFilters';
import type { PlatMode } from '@/lib/freePlayModeTimeControl';
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
  const hasGoodInventoryRef = useRef(false);
  const countsRef = useRef(counts);
  countsRef.current = counts;
  const mountedRef = useRef(true);
  const refetchRef = useRef<() => Promise<void>>(async () => undefined);

  const refetch = useCallback(async () => {
    if (inFlightRef.current) {
      pendingRef.current = true;
      return;
    }
    inFlightRef.current = true;
    try {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      const { inventory, error } = await fetchPublicOpenSeatLobbyInventory(supabase);
      if (!mountedRef.current) return;

      const next = applyHubInventoryResult({
        inventory,
        error,
        priorCounts: countsRef.current,
        hasGoodInventory: hasGoodInventoryRef.current,
        countFn: countPublicVisibleOpenSeatsByPlatMode,
      });
      setCounts(next.counts);
      hasGoodInventoryRef.current = next.hasGoodInventory;
      setLoading(next.loading);

      if (lobbyGamesRtDebugEnabled() && process.env.NODE_ENV === 'development') {
        console.debug('[free-open-seat-activity] refetch', {
          error,
          openCandidates: inventory?.openCandidates.length ?? 0,
          next: next.counts,
          loading: next.loading,
        });
      }
    } finally {
      inFlightRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        void refetchRef.current();
      }
    }
  }, []);

  refetchRef.current = refetch;

  useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    void refetchRef.current();
    return () => {
      mountedRef.current = false;
    };
  }, [refetch]);

  useEffect(() => {
    if (!lobbyRt) return;
    return lobbyRt.subscribe(() => {
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
