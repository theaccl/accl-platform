'use client';

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { FreePlayLobbyGamesRealtimeContext } from '@/components/free/FreePlayLobbyGamesRealtimeProvider';
import { useFreePlayWatchList } from '@/hooks/useFreePlayWatchList';
import {
  countOpenSeatsByClockAndLane,
  countWatchRowsByClock,
  emptyClockLaneCountsForMode,
  type OpenSeatClockLaneCounts,
} from '@/lib/lobbyModeClockActivity';
import {
  filterPublicVisibleOpenSeats,
  partitionLobbyRowsForPublicOpen,
} from '@/lib/freeLobbyOpenSeatFilters';
import type { PlatMode } from '@/lib/freePlayModeTimeControl';
import type { FreePlayWatchListRow } from '@/lib/server/freePlayWatchList';
import { supabase } from '@/lib/supabaseClient';

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
  const [openByClock, setOpenByClock] = useState<Record<string, OpenSeatClockLaneCounts>>(() =>
    emptyClockLaneCountsForMode(mode),
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
      .select('id,white_player_id,black_player_id,tempo,live_time_control,rated,status')
      .eq('play_context', 'free')
      .is('tournament_id', null)
      .in('status', ['active', 'waiting'])
      .limit(240);
    const allRows = !error && data?.length ? data : [];
    const { openCandidates, seatedForBusy } = partitionLobbyRowsForPublicOpen(
      allRows as Array<{
        id: string;
        white_player_id: string;
        black_player_id: string | null;
        tempo: string | null;
        live_time_control: string | null;
        rated: boolean | null;
        status: string | null;
      }>,
    );
    const visible = filterPublicVisibleOpenSeats(openCandidates, seatedForBusy, mode);
    setOpenByClock(countOpenSeatsByClockAndLane(mode, visible));
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
    setOpenByClock(emptyClockLaneCountsForMode(mode));
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
