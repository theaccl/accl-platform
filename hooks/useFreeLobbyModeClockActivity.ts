'use client';

import { useContext, useEffect, useMemo, useRef, useState } from 'react';

import { FreePlayLobbyGamesRealtimeContext } from '@/components/free/FreePlayLobbyGamesRealtimeProvider';
import { useFreePlayWatchList } from '@/hooks/useFreePlayWatchList';
import {
  countWatchRowsByClock,
  type OpenSeatClockLaneCounts,
} from '@/lib/lobbyModeClockActivity';
import { fetchPublicOpenSeatLobbyInventory } from '@/lib/fetchPublicOpenSeatLobbyInventory';
import {
  createFreeLobbyModeClockOpenController,
  type FreeLobbyModeClockOpenSnapshot,
} from '@/lib/freeLobbyModeClockOpenController';
import type { PlatMode } from '@/lib/freePlayModeTimeControl';
import type { FreePlayWatchListRow } from '@/lib/server/freePlayWatchList';
import { supabase } from '@/lib/supabaseClient';
import { emptyClockLaneCountsForMode } from '@/lib/lobbyModeClockActivity';

/** Per-clock open-seat and watch counts for a single mode room (presentation only). */
export function useFreeLobbyModeClockActivity(
  mode: PlatMode,
  viewerEcosystem: 'adult' | 'k12' = 'adult',
): {
  openByClock: Record<string, OpenSeatClockLaneCounts>;
  watchByClock: Record<string, number>;
  watchRows: FreePlayWatchListRow[];
  watchLoading: boolean;
  watchError: string | null;
  loading: boolean;
} {
  const { data: watchData, loading: watchLoading, error: watchError } =
    useFreePlayWatchList(viewerEcosystem);
  const watchRows = watchData?.byMode[mode] ?? [];
  const [snap, setSnap] = useState<FreeLobbyModeClockOpenSnapshot>(() => ({
    openByClock: emptyClockLaneCountsForMode(mode),
    openLoading: true,
    hasGoodInventory: false,
    modeGeneration: 0,
    mode,
  }));
  const lobbyRt = useContext(FreePlayLobbyGamesRealtimeContext);
  const lastNotifyAtRef = useRef(0);
  const mountedRef = useRef(true);

  const controllerRef = useRef<ReturnType<typeof createFreeLobbyModeClockOpenController> | null>(null);
  if (controllerRef.current == null) {
    controllerRef.current = createFreeLobbyModeClockOpenController(mode, {
      fetchInventory: () => fetchPublicOpenSeatLobbyInventory(supabase),
      onChange: (next) => {
        if (!mountedRef.current) return;
        setSnap(next);
      },
    });
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    if (!lobbyRt || !controllerRef.current) return;
    const ctrl = controllerRef.current;
    return lobbyRt.subscribe(() => {
      const nowMs = Date.now();
      if (nowMs - lastNotifyAtRef.current < 1_500) return;
      lastNotifyAtRef.current = nowMs;
      ctrl.requestNotifyResync();
    });
  }, [lobbyRt]);

  const watchByClock = useMemo(() => countWatchRowsByClock(mode, watchRows), [mode, watchRows]);

  return {
    openByClock: snap.openByClock,
    watchByClock,
    watchRows,
    watchLoading,
    watchError,
    loading: snap.openLoading || watchLoading,
  };
}
