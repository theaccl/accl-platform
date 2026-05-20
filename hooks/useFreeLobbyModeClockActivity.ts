'use client';

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { FreePlayLobbyGamesRealtimeContext } from '@/components/free/FreePlayLobbyGamesRealtimeProvider';
import { useFreePlayWatchList } from '@/hooks/useFreePlayWatchList';
import {
  countOpenSeatsByClock,
  countWatchRowsByClock,
  emptyClockCountsForMode,
} from '@/lib/lobbyModeClockActivity';
import { openSeatMatchesPlatMode } from '@/lib/freePlayOpenSeatsFilter';
import type { PlatMode } from '@/lib/freePlayModeTimeControl';
import type { FreePlayWatchListRow } from '@/lib/server/freePlayWatchList';
import { supabase } from '@/lib/supabaseClient';

/** Per-clock open-seat and watch counts for a single mode room (presentation only). */
export function useFreeLobbyModeClockActivity(
  mode: PlatMode,
  viewerEcosystem: 'adult' | 'k12' = 'adult',
): {
  openByClock: Record<string, number>;
  watchByClock: Record<string, number>;
  watchRows: FreePlayWatchListRow[];
  watchLoading: boolean;
  watchError: string | null;
  loading: boolean;
} {
  const { data: watchData, loading: watchLoading, error: watchError } =
    useFreePlayWatchList(viewerEcosystem);
  const watchRows = watchData?.byMode[mode] ?? [];
  const [openByClock, setOpenByClock] = useState<Record<string, number>>(() =>
    emptyClockCountsForMode(mode),
  );
  const [openLoading, setOpenLoading] = useState(true);
  const lobbyRt = useContext(FreePlayLobbyGamesRealtimeContext);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);
  const lastNotifyAtRef = useRef(0);

  const watchByClock = useMemo(() => countWatchRowsByClock(mode, watchRows), [mode, watchRows]);

  const refetchOpen = useCallback(async () => {
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
    const modeRows =
      !error && data?.length
        ? (data as { tempo: string | null; live_time_control: string | null }[]).filter((r) =>
            openSeatMatchesPlatMode(r, mode),
          )
        : [];
    setOpenByClock(countOpenSeatsByClock(mode, modeRows));
    setOpenLoading(false);
    inFlightRef.current = false;
    if (pendingRef.current) {
      pendingRef.current = false;
      void refetchOpen();
    }
  }, [mode]);

  const refetchOpenRef = useRef(refetchOpen);
  refetchOpenRef.current = refetchOpen;

  useEffect(() => {
    setOpenByClock(emptyClockCountsForMode(mode));
    setOpenLoading(true);
    void refetchOpenRef.current();
  }, [mode]);

  useEffect(() => {
    if (!lobbyRt) return;
    return lobbyRt.subscribe(() => {
      const now = Date.now();
      if (now - lastNotifyAtRef.current < 1_500) return;
      lastNotifyAtRef.current = now;
      void refetchOpenRef.current();
    });
  }, [lobbyRt]);

  return {
    openByClock,
    watchByClock,
    watchRows,
    watchLoading,
    watchError,
    loading: openLoading || watchLoading,
  };
}
